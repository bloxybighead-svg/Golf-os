// Strokes gained of a hole from the shots recorded on it (round_shots).
//
// SG of a shot = E(before) - E(after) - 1 - penalty strokes, where E is the
// expected strokes to hole out from the baseline (lib/course/baseline.ts: the
// scratch golfer, or a given handicap). A shot "ends" where the next one
// starts, so a hole's shots add up exactly to E(tee) - strokes taken.
//
// Only a hole whose shots plus penalties equal its score, and that ends holed
// at a pin, is computed here; anything less means a shot went unrecorded and
// its strokes gained would be credited to a neighbour (roundSg then uses the
// scorecard estimate for that hole).
//
// Categories: off the tee (the tee shot on a par 4 or 5), approach (every other
// shot that starts more than AROUND_GREEN_YDS from the pin, a par 3 tee shot
// included), short game (that close, not on the green), putting (starts on the
// green). A putt run's distances after the first are unknown, so a hole's
// putts are one unit: E(first putt) - putts taken. When the first putt's start
// is unknown too, it is the scorecard estimate's first putt.
//
// Water and out of bounds are not places to play from: a shot that starts or
// ends there is treated as rough, and the penalty is the golfer's own entry.

import { distanceYds, type LatLng } from "@/lib/course/geo"
import type { Baseline } from "@/lib/course/baseline"
import type { SgCategory } from "@/lib/sgBenchmarks"
import { CHIP, PUTTER, type RoundShot, type ShotLie } from "./shots"
import { eGreen, proximityFt, shortGamePuttFt, type HoleSg } from "./sgEstimate"

/** A shot this close to the pin (and not on the green) is short game. From the spec; the usual 50-yard line. */
export const SHORT_GAME_YDS = 50

export interface HoleResult {
  holeNumber: number
  par: number
  strokes: number
}

const playable = (lie: ShotLie): Exclude<ShotLie, "water" | "oob" | "holed"> => (lie === "water" || lie === "oob" || lie === "holed" ? "rough" : lie)

const before = (baseline: Baseline, lie: ShotLie, from: LatLng, pin: LatLng): number => baseline.expectedFromStart(playable(lie), distanceYds(from, pin))

function categoryOf(shot: RoundShot, indexOnHole: number, par: number, distYds: number): SgCategory {
  if (shot.fromLie === "green") return "putting"
  if (indexOnHole === 0 && par >= 4) return "off_tee"
  return distYds > SHORT_GAME_YDS ? "approach" : "short_game"
}

/** The hole's strokes gained from its recorded shots, or null when they do not add up to its score. */
export function shotHoleSg(hole: HoleResult, all: readonly RoundShot[], baseline: Baseline): HoleSg | null {
  const shots = [...all].sort((a, b) => a.shotNumber - b.shotNumber)
  const holed = shots[shots.length - 1]
  const pin = holed?.toLie === "holed" ? holed.to : null
  const taken = shots.length + shots.reduce((n, s) => n + s.penaltyStrokes, 0)
  if (!pin || taken !== hole.strokes) return null

  const swings = shots.filter((s) => s.club !== PUTTER)
  const putts = shots.filter((s) => s.club === PUTTER)
  if (swings.length === 0 || swings.some((s) => !s.from)) return null

  // Where each unit starts: every swing shot, then the putts as one. With no start for the putts, the first putt is the estimate.
  const last = swings[swings.length - 1]
  const lastYds = distanceYds(last.from as LatLng, pin)
  const estimatedFt = last.club === CHIP || lastYds <= SHORT_GAME_YDS ? shortGamePuttFt(baseline) : proximityFt(baseline, lastYds)
  const puttStart = putts.length > 0 ? putts[0].from : null
  const e = swings.map((s) => before(baseline, s.fromLie, s.from as LatLng, pin))
  const ePutts = putts.length > 0 ? (puttStart ? before(baseline, "green", puttStart, pin) : eGreen(baseline, estimatedFt)) : null

  const categories: Record<SgCategory, number> = { off_tee: 0, approach: 0, short_game: 0, putting: 0 }
  let approachStartYds: number | null = null
  let total = 0
  swings.forEach((s, i) => {
    const next = i + 1 < swings.length ? e[i + 1] : (ePutts ?? 0)
    const sg = e[i] - next - 1 - s.penaltyStrokes
    const dist = distanceYds(s.from as LatLng, pin)
    const category = categoryOf(s, i, hole.par, dist)
    if (category === "approach" && approachStartYds == null) approachStartYds = dist
    categories[category] += sg
    total += sg
  })
  if (ePutts != null) {
    categories.putting += ePutts - putts.length
    total += ePutts - putts.length
  }
  return { holeNumber: hole.holeNumber, total, categories, approachStartYds, source: "shots", puttEstimated: putts.length > 0 && !puttStart }
}
