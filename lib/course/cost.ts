// Expected strokes to hole out ("strokes remaining") from a lie and distance.
// A shot's strokes gained = E(before) - E(after) - 1, so this table is the
// baseline that every strokes-gained number in the planner is measured against.
//
// The numbers are the PGA TOUR benchmark from Mark Broadie's published work
// (see broadieTables.ts for the exact sources). Two things to keep in mind:
//  1. It is a TOUR baseline. Amateurs take more strokes from every spot, so a
//     shot that gains strokes against tour average is a very good shot for a
//     handicap golfer; use the differences between clubs and aim points, not
//     the absolute strokes-gained sign, when planning.
//  2. Penalty relief (water, out of bounds) is not in the benchmark. The rule
//     conventions below are assumptions, labelled where they are used.

import { BROADIE_PUTTS, BROADIE_TABLE_9 } from "./broadieTables"
import type { Lie } from "./lies"

export type BaselineLie = "tee" | "fairway" | "rough" | "sand" | "recovery"

const COLUMN: Record<BaselineLie, number> = { tee: 1, fairway: 2, rough: 3, sand: 4, recovery: 5 }

/** Linear interpolation over sorted (x, y) points, extrapolating the end slopes. */
function interpolate(points: readonly (readonly [number, number])[], x: number): number {
  const n = points.length
  if (x <= points[0][0]) {
    const [x0, y0] = points[0]
    const [x1, y1] = points[1]
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  for (let i = 1; i < n; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  const [x0, y0] = points[n - 2]
  const [x1, y1] = points[n - 1]
  return y1 + ((y1 - y0) * (x - x1)) / (x1 - x0)
}

/**
 * Tour-average strokes to hole out from a non-green lie at `distYds`.
 * Inside 10 yd (the shortest tabulated distance) the 10 yd value is used;
 * beyond 600 yd the end slope is extended. The tee column only exists from
 * 100 yd, so a tee shot shorter than that uses the fairway column.
 */
export function tourExpected(lie: BaselineLie, distYds: number): number {
  const col = lie === "tee" && distYds < 100 ? COLUMN.fairway : COLUMN[lie]
  const pts: [number, number][] = []
  for (const row of BROADIE_TABLE_9) {
    const v = row[col]
    if (v != null) pts.push([row[0], v])
  }
  return interpolate(pts, Math.max(distYds, pts[0][0]))
}

/** Tour-average strokes to hole out from the green, by distance in feet. */
export function tourPutting(feet: number): number {
  if (feet <= 2) {
    // 0 ft is a tap-in worth exactly 1 stroke; the table starts at 2 ft (1.01).
    return 1 + (BROADIE_PUTTS[0][1] - 1) * (Math.max(feet, 0) / 2)
  }
  return interpolate(BROADIE_PUTTS, feet)
}

/** Lies a golfer can be standing on when they hit (adds the tee to the landing lies). */
export type StartLie = "tee" | Lie

/** Expected strokes remaining from a spot the golfer is standing on. */
export function expectedFromStart(lie: StartLie, distToPinYds: number): number {
  if (lie === "tee") return tourExpected("tee", distToPinYds)
  return expectedStrokesRemaining(lie, distToPinYds)
}

/**
 * Expected strokes remaining after a shot ends in `lie`, `distToPinYds` from the pin.
 *
 * Assumptions where the benchmark is silent (water and out of bounds):
 *  - water: one penalty stroke, then played from the fairway column at the
 *    landing distance (a drop near where the ball entered, ignoring lateral
 *    relief options and the chance the drop is in rough).
 *  - out of bounds: stroke and distance -- one penalty stroke, then the shot is
 *    replayed from where it was hit. `origin` says where that was.
 * Trees use the benchmark's "recovery" column (trees, bushes and other trouble).
 */
export function expectedStrokesRemaining(
  lie: Lie,
  distToPinYds: number,
  origin: { distYds: number; lie: StartLie } = { distYds: distToPinYds, lie: "fairway" }
): number {
  switch (lie) {
    case "green":
      return tourPutting(distToPinYds * 3)
    case "fairway":
      return tourExpected("fairway", distToPinYds)
    case "rough":
      return tourExpected("rough", distToPinYds)
    case "bunker":
      return tourExpected("sand", distToPinYds)
    case "trees":
      return tourExpected("recovery", distToPinYds)
    case "water":
      return 1 + tourExpected("fairway", distToPinYds)
    case "oob":
      return 1 + expectedFromStart(origin.lie, origin.distYds)
  }
}
