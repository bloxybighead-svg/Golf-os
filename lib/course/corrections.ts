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
// A generous sanity ceiling, not a real course limit -- long par 5s can run past 600 yards
// (the spec's own "50-600+" wording), this just catches an obvious typo like an extra digit.
const MIN_YARDAGE = 50
const MAX_YARDAGE = 800
const COURSE_RADIUS_YDS = 50 * 1760 // ~50 miles, the spec's own "rough check to catch typos"

export interface CorrectionInput {
  par?: number
  teeLat?: number
  teeLng?: number
  yardageYds?: number
  strokeIndex?: number
}

/** Field-by-field validation errors, keyed the same as CorrectionInput. Empty object = all valid. */
export function validateCorrection(input: CorrectionInput, courseCenter: LatLng): Partial<Record<keyof CorrectionInput, string>> {
  const errors: Partial<Record<keyof CorrectionInput, string>> = {}
  if (input.par != null && !VALID_PARS.has(input.par)) {
    errors.par = "Par must be 3, 4, 5, or 6."
  }
  if (input.teeLat != null && Math.abs(input.teeLat) > 90) {
    errors.teeLat = "Latitude must be between -90 and 90."
  }
  if (input.teeLng != null && Math.abs(input.teeLng) > 180) {
    errors.teeLng = "Longitude must be between -180 and 180."
  }
  if (input.teeLat != null && input.teeLng != null && !errors.teeLat && !errors.teeLng) {
    const d = distanceYds(courseCenter, { lat: input.teeLat, lng: input.teeLng })
    if (d > COURSE_RADIUS_YDS) {
      errors.teeLat = errors.teeLng = "That's too far from this course -- check for a typo."
    }
  }
  if (input.yardageYds != null && (input.yardageYds < MIN_YARDAGE || input.yardageYds > MAX_YARDAGE)) {
    errors.yardageYds = `Yardage should be between ${MIN_YARDAGE} and ${MAX_YARDAGE}.`
  }
  if (input.strokeIndex != null && (!Number.isInteger(input.strokeIndex) || input.strokeIndex < 1 || input.strokeIndex > 18)) {
    errors.strokeIndex = "Handicap (stroke index) must be a whole number from 1 to 18."
  }
  return errors
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
