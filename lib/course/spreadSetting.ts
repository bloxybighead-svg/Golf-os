// The golfer's on-course spread (strategy.ts ON_COURSE_SPREAD): how much wider
// their misses are on the course than on the range. Set on You -> Planner,
// saved per device, read by the Play planner. Same pattern as compareAgainst.

import { ESTIMATE_BAG_SPREAD, ON_COURSE_SPREAD, SPREAD_MAX, SPREAD_MIN, SPREAD_STEP } from "./strategy"

export const SPREAD_KEY = "golfos.onCourseSpread.v1"
/** Fired on window when the value changes in this tab (the storage event only reaches other tabs). */
export const SPREAD_EVENT = "golfos:on-course-spread"

/** Keeps the value inside the slider's range and on its step; anything unusable becomes the default. */
export function clampSpread(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return ON_COURSE_SPREAD
  const stepped = Math.round(n / SPREAD_STEP) * SPREAD_STEP
  return Math.round(Math.min(SPREAD_MAX, Math.max(SPREAD_MIN, stepped)) * 100) / 100
}

/** The spread a source plays with unless the golfer set their own: estimates (tier tables, already on-course) 1.0, shots and launch-monitor data 1.25. */
export function defaultSpreadFor(source: "calibrated" | "handicap" | "legacy"): number {
  return source === "handicap" ? ESTIMATE_BAG_SPREAD : ON_COURSE_SPREAD
}

/** What the golfer saved on You -> Planner, or null when they never touched it (the source's default then applies). */
export function readSpreadOverride(): number | null {
  try {
    const raw = localStorage.getItem(SPREAD_KEY)
    return raw == null ? null : clampSpread(raw)
  } catch {
    return null
  }
}

/** The spread the planner uses: the golfer's own setting if they made one, else the source's default. */
export function effectiveSpread(source: "calibrated" | "handicap" | "legacy", override: number | null): number {
  return override ?? defaultSpreadFor(source)
}

export function saveSpread(v: number): void {
  try {
    localStorage.setItem(SPREAD_KEY, String(clampSpread(v)))
  } catch {
    // private mode etc.: the choice just won't stick
  }
  try {
    window.dispatchEvent(new Event(SPREAD_EVENT))
  } catch {
    // no window (tests)
  }
}
