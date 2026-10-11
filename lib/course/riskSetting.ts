// The golfer's Smart-play risk (strategy.ts SMART_RISK_STROKES): how many strokes
// a point of OB/water share is worth. Set on You -> Planner, saved per device,
// read by the Play planner. Same pattern as spreadSetting.

import { RISK_STOPS, SMART_RISK_STROKES } from "./strategy"

export const RISK_KEY = "golfos.smartRisk.v1"
/** Fired on window when the value changes in this tab (the storage event only reaches other tabs). */
export const RISK_EVENT = "golfos:smart-risk"

/** One of the three stops; anything unusable becomes Normal. */
export function clampRisk(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v)
  return RISK_STOPS.find((s) => s.strokes === n)?.strokes ?? SMART_RISK_STROKES
}

export function readRisk(): number {
  try {
    const raw = localStorage.getItem(RISK_KEY)
    return raw == null ? SMART_RISK_STROKES : clampRisk(raw)
  } catch {
    return SMART_RISK_STROKES
  }
}

export function saveRisk(v: number): void {
  try {
    localStorage.setItem(RISK_KEY, String(clampRisk(v)))
  } catch {
    // private mode etc.: the choice just won't stick
  }
  try {
    window.dispatchEvent(new Event(RISK_EVENT))
  } catch {
    // no window (tests)
  }
}
