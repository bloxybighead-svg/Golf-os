// The result card's target in golfer words ("Aim 6 yd left of the pin"), from a club's best aim and the lie it points at.

import type { Lie } from "@/lib/course/lies"

/** A lateral offset under this is straight on, yards. ESTIMATE: finer than anyone aims by eye. */
export const STRAIGHT_ON_YDS = 1.5

/** From this far off the middle the aim reads as the edge of the fairway or rough, not just to one side, yards. ESTIMATE: about half a fairway's width. */
export const EDGE_FROM_YDS = 8

const SURFACE: Partial<Record<Lie, string>> = { fairway: "the fairway", rough: "the rough" }

/**
 * `offsetYds` is the aim's lateral shift from the hole's centreline at the club's reach (right positive), which is
 * the pin itself when the club reaches the green; `aimLie` is the lie where the aim points.
 */
export function aimText(offsetYds: number, aimLie: Lie | null): string {
  const yds = Math.round(Math.abs(offsetYds))
  const side = offsetYds < 0 ? "left" : "right"
  const surface = aimLie ? SURFACE[aimLie] : undefined
  if (Math.abs(offsetYds) < STRAIGHT_ON_YDS) {
    if (aimLie === "green") return "Aim at the pin"
    return surface ? `Aim down the middle of ${surface}` : "Aim down the line"
  }
  if (aimLie === "green") return `Aim ${yds} yd ${side} of the pin`
  if (!surface) return `Aim ${yds} yd ${side}`
  return Math.abs(offsetYds) >= EDGE_FROM_YDS ? `Aim at the ${side} edge of ${surface}` : `Aim ${yds} yd ${side} of the middle of ${surface}`
}
