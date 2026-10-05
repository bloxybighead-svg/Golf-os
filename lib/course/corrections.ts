// Golfer-submitted fixes for wrong course data (e.g. a hole tagged the wrong par).
// Pure merge/validation logic lives here so it's testable without Supabase; the actual
// read from the course_corrections table is a thin wrapper in lib/supabase/courseCorrections.ts.

import { distanceYds, type LatLng } from "./geo"
import type { CorrectableField, CourseGeometry, CourseHole } from "./overpass"

export interface CorrectionRow {
  hole_id: string
  field_name: CorrectableField
  corrected_value: string
}

const VALID_PARS = new Set([3, 4, 5, 6])
// Sanity bounds, not course rules: they stop typos and vandalism, not unusual-but-real holes.
export const MIN_YARDAGE = 50
export const MAX_YARDAGE = 700
export const MAX_TEE_MOVE_YDS = 150 // a corrected tee must stay this close to the hole's current tee
export const MAX_REASON_LENGTH = 200
// A correction applies for everyone only once this many DIFFERENT golfers submit the same value.
// (The database function course_corrections_consensus enforces the same floor of 2.)
export const CONSENSUS_MIN_USERS = 2

export interface CorrectionInput {
  par?: number
  teeLat?: number
  teeLng?: number
  yardageYds?: number
  strokeIndex?: number
  reason?: string
}

const isInt = (n: number) => Number.isInteger(n)

/** Field-by-field validation errors, keyed the same as CorrectionInput. Empty object = all valid.
 * `currentTee` is the hole's tee as it stands now; a corrected tee must be within MAX_TEE_MOVE_YDS of it. */
export function validateCorrection(input: CorrectionInput, currentTee: LatLng): Partial<Record<keyof CorrectionInput, string>> {
  const errors: Partial<Record<keyof CorrectionInput, string>> = {}
  if (input.par != null && !(isInt(input.par) && VALID_PARS.has(input.par))) {
    errors.par = "Par must be 3, 4, 5, or 6."
  }
  if (input.teeLat != null && !(Number.isFinite(input.teeLat) && Math.abs(input.teeLat) <= 90)) {
    errors.teeLat = "Latitude must be between -90 and 90."
  }
  if (input.teeLng != null && !(Number.isFinite(input.teeLng) && Math.abs(input.teeLng) <= 180)) {
    errors.teeLng = "Longitude must be between -180 and 180."
  }
  if ((input.teeLat != null || input.teeLng != null) && !errors.teeLat && !errors.teeLng) {
    const moved = { lat: input.teeLat ?? currentTee.lat, lng: input.teeLng ?? currentTee.lng }
    if (distanceYds(currentTee, moved) > MAX_TEE_MOVE_YDS) {
      const msg = `The tee can move at most ${MAX_TEE_MOVE_YDS} yards from where it is now.`
      if (input.teeLat != null) errors.teeLat = msg
      if (input.teeLng != null) errors.teeLng = msg
    }
  }
  if (input.yardageYds != null && !(Number.isFinite(input.yardageYds) && input.yardageYds >= MIN_YARDAGE && input.yardageYds <= MAX_YARDAGE)) {
    errors.yardageYds = `Yardage should be between ${MIN_YARDAGE} and ${MAX_YARDAGE}.`
  }
  if (input.strokeIndex != null && !(isInt(input.strokeIndex) && input.strokeIndex >= 1 && input.strokeIndex <= 18)) {
    errors.strokeIndex = "Handicap (stroke index) must be a whole number from 1 to 18."
  }
  if (input.reason != null && input.reason.length > MAX_REASON_LENGTH) {
    errors.reason = `Keep the reason under ${MAX_REASON_LENGTH} characters.`
  }
  return errors
}

/** One (hole, field, value) that some number of distinct golfers submitted, as returned by
 * the course_corrections_consensus database function. */
export interface ConsensusGroup {
  hole_id: string
  field_name: CorrectableField
  corrected_value: string
  voters: number
  last_at: string
}

/** The value to apply for everyone, per (hole, field): only groups with at least `minUsers`
 * distinct voters count; if several values qualify, the most-agreed one wins, then the latest. */
export function pickConsensus(groups: ConsensusGroup[], minUsers = CONSENSUS_MIN_USERS): CorrectionRow[] {
  const best = new Map<string, ConsensusGroup>()
  for (const g of groups) {
    if (g.voters < Math.max(minUsers, CONSENSUS_MIN_USERS)) continue
    const key = `${g.hole_id}|${g.field_name}`
    const cur = best.get(key)
    if (!cur || g.voters > cur.voters || (g.voters === cur.voters && g.last_at > cur.last_at)) best.set(key, g)
  }
  return Array.from(best.values()).map((g) => ({ hole_id: g.hole_id, field_name: g.field_name, corrected_value: g.corrected_value }))
}

/** Applies corrections on top of freshly-fetched or cached geometry. Read-time, not
 * baked into any cache, so a new correction takes effect on the very next load. */
export function applyCorrections(geometry: CourseGeometry, rows: CorrectionRow[]): CourseGeometry {
  if (rows.length === 0) return geometry
  const byHole = new Map<string, CorrectionRow[]>()
  for (const r of rows) {
    const list = byHole.get(r.hole_id) ?? []
    list.push(r)
    byHole.set(r.hole_id, list)
  }
  if (byHole.size === 0) return geometry
  return {
    ...geometry,
    holes: geometry.holes.map((h) => {
      const corrections = byHole.get(h.id)
      if (!corrections) return h
      return applyCorrectionsToHole(h, corrections)
    }),
  }
}

function applyCorrectionsToHole(hole: CourseHole, rows: CorrectionRow[]): CourseHole {
  const correctedFields: CorrectableField[] = [...(hole.correctedFields ?? [])]
  const next: CourseHole = { ...hole, line: [...hole.line], correctedFields }
  let teeLat: number | undefined
  let teeLng: number | undefined
  for (const r of rows) {
    switch (r.field_name) {
      case "par": {
        const v = parseInt(r.corrected_value, 10)
        if (VALID_PARS.has(v)) next.par = v
        break
      }
      case "tee_lat": {
        const v = Number(r.corrected_value)
        if (Number.isFinite(v)) teeLat = v
        break
      }
      case "tee_lng": {
        const v = Number(r.corrected_value)
        if (Number.isFinite(v)) teeLng = v
        break
      }
      case "yardage": {
        const v = Number(r.corrected_value)
        if (Number.isFinite(v)) next.yardageYds = v
        break
      }
      case "handicap": {
        const v = parseInt(r.corrected_value, 10)
        if (Number.isFinite(v)) next.strokeIndex = v
        break
      }
    }
    if (!correctedFields.includes(r.field_name)) correctedFields.push(r.field_name)
  }
  if (teeLat != null || teeLng != null) {
    const tee = next.line[0]
    next.line[0] = { lat: teeLat ?? tee.lat, lng: teeLng ?? tee.lng }
  }
  return next
}
