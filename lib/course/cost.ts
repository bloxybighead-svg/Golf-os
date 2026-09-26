// Expected strokes REMAINING to hole out from a lie and distance to the
// pin. This is the "strokes gained" building block: a shot's value is
// (expected strokes before) - (expected strokes after) - 1.
//
// PLACEHOLDER VALUES. The shapes follow the published tour-level pattern
// (Broadie, "Every Shot Counts", 2014) but the exact numbers below are
// rounded approximations typed from memory of that pattern, NOT taken
// from his tables, and tour numbers understate amateur scoring. Before
// citing any output in the paper, replace them with a sourced table.
// The ranking of clubs is what this is meant to drive, not the absolute
// strokes.

import type { Lie } from "./lies"

// Putting: [feet, expected strokes to hole out] (tour-average pattern).
const PUTTING: [number, number][] = [
  [0, 1.0], [3, 1.04], [5, 1.15], [8, 1.5], [10, 1.61], [15, 1.78],
  [20, 1.87], [30, 1.98], [40, 2.06], [50, 2.14], [60, 2.2], [90, 2.4], [150, 2.7],
]

function puttingStrokes(feet: number): number {
  if (feet >= PUTTING[PUTTING.length - 1][0]) return PUTTING[PUTTING.length - 1][1]
  for (let i = 1; i < PUTTING.length; i++) {
    const [x1, y1] = PUTTING[i]
    if (feet <= x1) {
      const [x0, y0] = PUTTING[i - 1]
      return y0 + ((y1 - y0) * (feet - x0)) / (x1 - x0)
    }
  }
  return PUTTING[PUTTING.length - 1][1]
}

/** Fairway baseline: roughly 2.8 at 100 yd, 3.25 at 200 yd, 3.7 at 300 yd. */
function fairwayStrokes(distYds: number): number {
  return 2.35 + 0.0045 * distYds
}

const ROUGH_PENALTY = 0.3
const BUNKER_PENALTY = 0.5
const WATER_PENALTY = 1.0 // one penalty stroke, then play on from near where it entered

export function expectedStrokesRemaining(lie: Lie, distToPinYds: number): number {
  switch (lie) {
    case "green":
      return puttingStrokes(distToPinYds * 3)
    case "fairway":
      return fairwayStrokes(distToPinYds)
    case "rough":
      return fairwayStrokes(distToPinYds) + ROUGH_PENALTY
    case "bunker":
      return fairwayStrokes(distToPinYds) + BUNKER_PENALTY
    case "water":
      return fairwayStrokes(distToPinYds) + WATER_PENALTY
  }
}
