// A golfer's starting numbers from setup (/welcome): handicap, how far they
// carry each club they gave, and a home course. Stored per account in
// golfer_baseline and mirrored into the Play planner's device settings, which
// is what the planner actually reads.

import { DEFAULT_BAG, normalizeBag } from "./bag"
import { BAG_ORDER, type Club } from "./tables"

export interface CourseRef {
  id: string
  name: string
  city: string | null
  state: string | null
  par: number | null
  lat: number | null
  lng: number | null
}

export interface Baseline {
  handicapIndex: number | null
  carries: Partial<Record<Club, number>>
  homeCourse: CourseRef | null
}

// The planner's device-storage keys (read by CourseMapClient).
export const SETTINGS_KEY = "golfos.planner.v1"
export const LAST_POSITION_KEY = "golfos.lastPosition.v1"
/** "1" once setup ran on this device, "dismissed" if the golfer waved the prompt away. */
export const ONBOARDED_KEY = "golfos.onboarded.v1"

const MIN_CARRY = 40
const MAX_CARRY = 400

/** Keeps catalog clubs with a plausible carry, rounded to the yard. */
export function cleanCarries(raw: Record<string, unknown>): Partial<Record<Club, number>> {
  const out: Partial<Record<Club, number>> = {}
  for (const club of BAG_ORDER) {
    const v = Number(raw[club])
    if (Number.isFinite(v) && v >= MIN_CARRY && v <= MAX_CARRY) out[club] = Math.round(v)
  }
  return out
}

/** A handicap index in the WHS range (plus handicaps as negatives), to one decimal; else null. */
export function cleanHandicap(raw: unknown): number | null {
  if (raw === "" || raw == null) return null
  const v = Number(raw)
  if (!Number.isFinite(v) || v < -10 || v > 54) return null
  return Math.round(v * 10) / 10
}

/** The default new-golfer bag plus every club they gave a carry for. */
export function bagFor(carries: Partial<Record<Club, number>>): Club[] {
  return normalizeBag([...DEFAULT_BAG, ...(Object.keys(carries) as Club[])])
}

/**
 * Writes a baseline into this device's planner settings so Play uses it on the
 * next load: the golfer's own clubs as the shot source, their handicap and
 * carries, a bag holding every club they gave, and their home course as the
 * place to open.
 */
export function applyBaselineToDevice(b: Baseline): void {
  try {
    const existing = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")
    const { Driver, "7-Iron": seven, ...others } = b.carries
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...existing,
        source: "handicap",
        handicap: b.handicapIndex ?? existing.handicap ?? 18,
        driverCarry: Driver != null ? String(Driver) : "",
        sevenIronCarry: seven != null ? String(seven) : "",
        carries: others,
        bags: { ...(existing.bags ?? {}), handicap: bagFor(b.carries) },
      })
    )
    if (b.homeCourse) localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ course: b.homeCourse, holeId: null }))
    localStorage.setItem(ONBOARDED_KEY, "1")
  } catch {
    // Private mode or full storage: Play falls back to its defaults.
  }
}
