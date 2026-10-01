// Labels and small display helpers for the Play planner (moved verbatim from
// components/simulator/CourseMapClient.tsx).

import type { Lie } from "@/lib/course/lies"
import type { SurfaceStatus } from "@/lib/course/dataQuality"

export const LIES: Lie[] = ["green", "fairway", "rough", "bunker", "water", "trees", "oob"]
export const LIE_LABEL: Record<Lie, string> = {
  green: "Green",
  fairway: "Fairway",
  rough: "Rough",
  bunker: "Bunker",
  water: "Water",
  trees: "Trees",
  oob: "Out of bounds",
}
export const LIE_SHORT: Record<Lie, string> = { green: "Grn", fairway: "Fwy", rough: "Rgh", bunker: "Bkr", water: "Wtr", trees: "Tre", oob: "OB" }
export const STATUS_TITLE: Record<SurfaceStatus, string> = {
  mapped: "Mapped in the course data",
  "hand-drawn": "Hand-drawn by you",
  estimated: "Not mapped, so estimated",
  missing: "Not mapped",
  "confirmed-absent": "You confirmed there's none here. Click to undo.",
}
export const ALWAYS_SHOWN: Lie[] = ["green", "fairway", "rough"]
// Options offered by "Mark area" for hand-drawing what the map doesn't show
// (or gets wrong): "fairway"/"rough"/"green" let you mark a SAFE area too,
// e.g. to correct a wrongly-guessed out-of-bounds patch.
export const DRAW_KINDS: Lie[] = ["trees", "water", "bunker", "oob", "fairway", "rough", "green"]

export const pct = (x: number) => (x < 0.005 ? "–" : `${Math.round(x * 100)}%`)

/** "Pebble Beach Golf Links" -> "Pebble Beach": the title line has room for one short name. */
export function shortCourseName(name: string): string {
  const short = name.replace(/\s+(golf\s+(club|links|course|resort)|country\s+club|g\.?c\.?|c\.?c\.?)$/i, "").trim()
  return short || name
}
