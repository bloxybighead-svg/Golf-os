// The result card's target in golfer words, from a club's best aim and the lie it points at.

import type { Lie } from "@/lib/course/lies"

/** A lateral offset under this is straight on, yards. ESTIMATE: finer than anyone aims by eye. */
export const STRAIGHT_ON_YDS = 1.5

const SURFACE: Partial<Record<Lie, string>> = { fairway: "the fairway", rough: "the rough" }

/**
 * `offsetYds` is the aim's lateral shift from the hole's centreline at the club's reach (right positive), which is
 * the pin itself when the club reaches the green; `aimLie` is the lie where the aim points.
 */
export function aimText(offsetYds: number, aimLie: Lie | null): string {
  const yds = Math.round(Math.abs(offsetYds))
  const side = offsetYds < 0 ? "left" : "right"
  const surface = aimLie ? SURFACE[aimLie] : undefined
  const straight = Math.abs(offsetYds) < STRAIGHT_ON_YDS
  if (aimLie === "green") return straight ? "At the pin" : `${yds} yd ${side} of the pin`
  if (surface) return straight ? `Center of ${surface}` : `${side === "left" ? "Left" : "Right"} side of ${surface}`
  return straight ? "Down the line" : `${yds} yd ${side}`
}
