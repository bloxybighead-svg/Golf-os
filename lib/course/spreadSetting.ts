// The golfer's on-course spread (strategy.ts ON_COURSE_SPREAD): how much wider
// their misses are on the course than on the range. Set on You -> Planner,
// saved per device, read by the Play planner. Same pattern as compareAgainst.

import { ON_COURSE_SPREAD, SPREAD_MAX, SPREAD_MIN, SPREAD_STEP } from "./strategy"

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

export function readSpread(): number {
  try {
    const raw = localStorage.getItem(SPREAD_KEY)
    return raw == null ? ON_COURSE_SPREAD : clampSpread(raw)
  } catch {
    return ON_COURSE_SPREAD
  }
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
