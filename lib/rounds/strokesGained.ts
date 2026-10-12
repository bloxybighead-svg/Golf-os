// Strokes gained from the shots recorded in a round (round_shots).
//
// SG of a shot = E(before) - E(after) - 1 - penalty strokes, where E is the
// expected strokes to hole out from the baseline (lib/course/baseline.ts: the
// scratch golfer, or a given handicap). A shot "ends" where the next one
// starts, so a hole's shots add up exactly to E(tee) - strokes taken.
//
// Only holes where every stroke is accounted for count: the shots plus their
// penalties must equal the hole's score, and the hole must end holed at a pin.
// Anything less means a shot went unrecorded, and its strokes gained would be
// credited to a neighbour.
//
// Categories: off the tee (the tee shot on a par 4 or 5), approach (every other
// shot that starts more than AROUND_GREEN_YDS from the pin, a par 3 tee shot
// included), around the green (that close, not on the green), putting (starts on
// the green). A putt run's distances after the first are unknown, so a hole's
// putts are one unit: E(first putt) - putts taken.
//
// Water and out of bounds are not places to play from: a shot that starts or
// ends there is treated as rough, and the penalty is the golfer's own entry.

import { distanceYds, type LatLng } from "@/lib/course/geo"
import type { Baseline } from "@/lib/course/baseline"
import type { SgCategory } from "@/lib/sgBenchmarks"
import { PUTTER, type RoundShot, type ShotLie } from "./shots"

/** A shot this close to the pin (and not on the green) is around the green. From the spec; the usual 50-yard line. */
const AROUND_GREEN_YDS = 50

export const SG_CATEGORIES: readonly SgCategory[] = ["off_tee", "approach", "short_game", "putting"]

export interface HoleResult {
  holeNumber: number
  par: number
  strokes: number
}

export interface ShotSg {
  holeNumber: number
  category: SgCategory
  sg: number
  /** Shots this entry stands for: 1, or the putts of a hole. */
  count: number
}

export interface RoundSg {
  shots: ShotSg[]
  /** Holes with every stroke accounted for. */
  holesCounted: number
}

const playable = (lie: ShotLie): Exclude<ShotLie, "water" | "oob" | "holed"> =>
  lie === "water" || lie === "oob" || lie === "holed" ? "rough" : lie

function before(baseline: Baseline, lie: ShotLie, from: LatLng, pin: LatLng): number {
  return baseline.expectedFromStart(playable(lie), distanceYds(from, pin))
}

function categoryOf(shot: RoundShot, indexOnHole: number, par: number, distYds: number): SgCategory {
  if (shot.fromLie === "green") return "putting"
  if (indexOnHole === 0 && par >= 4) return "off_tee"
  return distYds > AROUND_GREEN_YDS ? "approach" : "short_game"
}

/** The hole's strokes gained by shot, or null when its shots do not add up to its score. */
function holeSg(hole: HoleResult, all: readonly RoundShot[], baseline: Baseline): ShotSg[] | null {
  const shots = [...all].sort((a, b) => a.shotNumber - b.shotNumber)
  const holed = shots[shots.length - 1]
  const pin = holed?.toLie === "holed" ? holed.to : null
  const taken = shots.length + shots.reduce((n, s) => n + s.penaltyStrokes, 0)
  if (!pin || taken !== hole.strokes) return null

  const swings = shots.filter((s) => s.club !== PUTTER)
  const putts = shots.filter((s) => s.club === PUTTER)
  if (swings.some((s) => !s.from) || (putts.length > 0 && !putts[0].from)) return null

  // Where each unit starts: every swing shot, then the putts as one.
  const starts = [...swings.map((s) => s.from as LatLng), ...(putts.length > 0 ? [putts[0].from as LatLng] : [])]
  const lies = [...swings.map((s) => s.fromLie), ...(putts.length > 0 ? ["green" as const] : [])]
  const e = starts.map((from, i) => before(baseline, lies[i], from, pin))

  const out: ShotSg[] = swings.map((s, i) => ({
    holeNumber: hole.holeNumber,
    category: categoryOf(s, i, hole.par, distanceYds(s.from as LatLng, pin)),
    // The last swing ends where the putts start (or in the hole, with no putts: E after = 0).
    sg: e[i] - (i + 1 < e.length ? e[i + 1] : 0) - 1 - s.penaltyStrokes,
    count: 1,
  }))
  if (putts.length > 0) {
    out.push({ holeNumber: hole.holeNumber, category: "putting", sg: e[e.length - 1] - putts.length, count: putts.length })
  }
  return out
}

/** One round's strokes gained against `baseline`, over the holes whose shots are complete. */
export function strokesGainedForRound(holes: readonly HoleResult[], shots: readonly RoundShot[], baseline: Baseline): RoundSg {
  const out: RoundSg = { shots: [], holesCounted: 0 }
  for (const hole of holes) {
    const sg = holeSg(hole, shots.filter((s) => s.holeNumber === hole.holeNumber), baseline)
    if (!sg) continue
    out.shots.push(...sg)
    out.holesCounted += 1
  }
  return out
}

export interface CategorySg {
  category: SgCategory
  /** Strokes gained over every counted hole. */
  total: number
  /** Shots behind it (a hole's putts each count). */
  shots: number
  /** Total scaled to 18 holes, so a round with a few untracked holes is not understated. */
  per18: number
}

export interface SgSummary {
  categories: CategorySg[]
  rounds: number
  holesCounted: number
}

/** The categories over several rounds. Always the four, in order; a category with no shots is 0. */
export function summarizeSg(rounds: readonly RoundSg[]): SgSummary {
  const holesCounted = rounds.reduce((n, r) => n + r.holesCounted, 0)
  const categories = SG_CATEGORIES.map((category) => {
    const rows = rounds.flatMap((r) => r.shots).filter((s) => s.category === category)
    const total = rows.reduce((n, s) => n + s.sg, 0)
    return { category, total, shots: rows.reduce((n, s) => n + s.count, 0), per18: holesCounted > 0 ? (total / holesCounted) * 18 : 0 }
  })
  return { categories, rounds: rounds.length, holesCounted }
}
