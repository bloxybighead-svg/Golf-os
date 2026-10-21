// Strokes gained from the simple per-hole entries every golfer already makes
// (score, putts, fairway, green, penalty), with no shot tracking.
//
// A hole is split into phases (off the tee, approach, around the green,
// putting). Each phase's strokes gained is E(before) - E(after) - the strokes
// taken in that phase, where E is the expected strokes to hole out from the
// comparison baseline (lib/course/baseline.ts). The phases chain end to start,
// so they add up exactly to E(tee) - strokes for the hole, whatever the guesses
// about where the ball finished: a wrong guess moves strokes between phases,
// never in or out of the hole's total.
//
// What the hole entry does not say is guessed, and every guess is a constant
// below labelled ESTIMATE.

import type { Baseline } from "@/lib/course/baseline"
import { PUTT_STRETCH_PER_HCP, REFERENCE_ROUND } from "@/lib/course/baseline"
import type { PenaltyShot } from "./holes"
import type { SgCategory } from "@/lib/sgBenchmarks"

/** A hole's yards when the scorecard has no yardage for the tee and the course total is unknown. ESTIMATE: typical par-3 / par-4 / par-5 lengths. */
export const DEFAULT_HOLE_YARDS = { 3: 165, 4: 390, 5: 520 } as const

/** The tee shot never finishes closer to the pin than this. ESTIMATE: a drive that long would be a club down from the tee. */
const MIN_APPROACH_YDS = 40

/** Driver total (carry plus roll) when the bag has no driver. ESTIMATE: a typical amateur drive. */
const DEFAULT_DRIVER_TOTAL_YDS = 230

/** Where a missed green's approach is assumed to finish: this far from the pin, in the rough. ESTIMATE: a typical greenside miss. */
export const AROUND_GREEN_YDS = 15

/** First putt after a short-game shot, tour-like golfer, feet. ESTIMATE: a chip or pitch that gets up and down about half the time finishes near here. */
const SHORT_GAME_PUTT_FT = 8

/** An approach from `d` yards finishes about this many feet from the pin per yard hit. ESTIMATE: PGA TOUR proximity is about 20-30 ft from 100-175 yd. */
const PROXIMITY_FT_PER_YD = 0.17

/** The first putt after a green hit is never closer or farther than this. ESTIMATE: keeps a wedge from reading as a tap-in and a long iron as a 60-footer. */
const MIN_PROXIMITY_FT = 8
const MAX_PROXIMITY_FT = 45

/** A hole with no fairway entry is treated as a fairway hit. ESTIMATE: it only moves strokes between off the tee and approach. */
const UNKNOWN_FAIRWAY_IS_HIT = true

export const SG_CATEGORIES: readonly SgCategory[] = ["off_tee", "approach", "short_game", "putting"]

export interface EstimateHole {
  holeNumber: number
  par: number
  strokes: number
  putts: number | null
  fairwayHit: boolean | null
  greenHit: boolean | null
  penalty: boolean
  penaltyShot: PenaltyShot | null
  /** The golfer's own first putt, feet (Part 2); beats the estimate. */
  firstPuttFt: number | null
}

type YardsSource = "scorecard" | "course_total" | "par_default"

export interface HoleYards {
  yds: number
  source: YardsSource
}

/**
 * The hole's yards: the scorecard's for the tee played, else the course's total
 * yards times the share a hole of this par has in a typical course, else a
 * typical hole of this par. The source says which, so the screen can label a guess.
 */
export function resolveHoleYards(args: { par: number; holeYds: number | null; courseTotalYds: number | null }): HoleYards {
  if (args.holeYds != null && args.holeYds > 0) return { yds: Math.round(args.holeYds), source: "scorecard" }
  const typical = DEFAULT_HOLE_YARDS[Math.min(5, Math.max(3, args.par)) as 3 | 4 | 5]
  if (args.courseTotalYds != null && args.courseTotalYds > 0) {
    const refTotal = REFERENCE_ROUND.reduce((s, h) => s + h.yds, 0)
    const refYds = REFERENCE_ROUND.find((h) => h.par === Math.min(5, Math.max(3, args.par)))?.yds ?? typical
    return { yds: Math.round((args.courseTotalYds * refYds) / refTotal), source: "course_total" }
  }
  return { yds: typical, source: "par_default" }
}

/** The shape every strokes-gained result takes, from the scorecard or from tracked shots. */
export interface HoleSg {
  holeNumber: number
  /** E(tee) - strokes. */
  total: number
  /** Null when the hole has no putts entry: there is no category split without it. */
  categories: Record<SgCategory, number> | null
  /** Yards from where the approach started to the pin; null when the hole has no approach. */
  approachStartYds: number | null
  source: "scorecard" | "shots"
  /** The first putt's distance was guessed. */
  puttEstimated: boolean
}

const emptyCategories = (): Record<SgCategory, number> => ({ off_tee: 0, approach: 0, short_game: 0, putting: 0 })

/** How far a golfer of this baseline stretches distances: the factor the baseline itself puts on putts. */
const levelStretch = (baseline: Baseline): number => Math.max(0.5, 1 + PUTT_STRETCH_PER_HCP * (baseline.handicap ?? 0))

/** E from a spot on the green `feet` from the pin. */
export const eGreen = (baseline: Baseline, feet: number): number => baseline.expectedFromStart("green", feet / 3)

/** The first putt after hitting the green with an approach from `approachYds`, feet. ESTIMATE, scaled by the level like the baseline scales putts. */
export function proximityFt(baseline: Baseline, approachYds: number): number {
  const ft = Math.min(MAX_PROXIMITY_FT, Math.max(MIN_PROXIMITY_FT, approachYds * PROXIMITY_FT_PER_YD))
  return ft * levelStretch(baseline)
}

/** The first putt after a chip or pitch, feet. ESTIMATE, scaled by the level. */
export const shortGamePuttFt = (baseline: Baseline): number => SHORT_GAME_PUTT_FT * levelStretch(baseline)

/** Whether the green was missed: said so, or, with no green entry, more strokes before putting than a regulation hole allows. */
export function missedGreen(h: Pick<EstimateHole, "par" | "strokes" | "putts" | "greenHit">): boolean {
  if (h.greenHit != null) return !h.greenHit
  return h.putts != null && h.strokes - h.putts > h.par - 2
}

/** One hole's strokes gained from its entries. */
export function estimateHoleSg(h: EstimateHole, ctx: { baseline: Baseline; driverTotalYds: number | null; yards: HoleYards }): HoleSg {
  const { baseline } = ctx
  const yds = ctx.yards.yds
  const eTee = baseline.expectedFromStart("tee", yds)
  const total = eTee - h.strokes
  const base: HoleSg = { holeNumber: h.holeNumber, total, categories: null, approachStartYds: null, source: "scorecard", puttEstimated: false }

  const putts = h.putts
  const before = putts == null ? 0 : h.strokes - putts // strokes before the first putt
  // Without a putts entry, or with putts that leave no swing to reach the green, there is no honest split.
  if (putts == null || before < 1) return base

  const teeShot = h.par >= 4
  const teePenalty = teeShot && h.penalty && h.penaltyShot === "tee"
  const teeStrokes = teeShot ? 1 + (teePenalty ? 1 : 0) : 0
  const chip = missedGreen(h) && before - teeStrokes - 1 >= 1 ? 1 : 0
  const approachStrokes = before - teeStrokes - chip
  if (approachStrokes < 0) return base

  // Where the tee shot finishes, and in what lie.
  const driver = ctx.driverTotalYds ?? DEFAULT_DRIVER_TOTAL_YDS
  const afterTeeYds = Math.max(MIN_APPROACH_YDS, yds - driver)
  const fairway = h.fairwayHit == null ? UNKNOWN_FAIRWAY_IS_HIT : h.fairwayHit
  const afterTeeLie = fairway && !teePenalty ? "fairway" : "rough"
  const approachStartYds = teeShot ? afterTeeYds : yds
  const approachFrom = teeShot ? baseline.expectedFromStart(afterTeeLie, afterTeeYds) : eTee

  // The first putt, and E once the last swing has finished.
  const puttFt =
    h.firstPuttFt != null ? h.firstPuttFt : chip === 1 ? shortGamePuttFt(baseline) : proximityFt(baseline, teeShot && approachStrokes === 0 ? yds : approachStartYds)
  const afterSwings = putts >= 1 ? eGreen(baseline, puttFt) : 0

  const categories = emptyCategories()
  let prevE = eTee
  if (teeStrokes > 0) {
    const next = approachStrokes > 0 || chip === 1 ? approachFrom : afterSwings
    categories.off_tee = prevE - next - teeStrokes
    prevE = next
  }
  if (approachStrokes > 0) {
    const next = chip === 1 ? baseline.expectedFromStart("rough", AROUND_GREEN_YDS) : afterSwings
    categories.approach = prevE - next - approachStrokes
    prevE = next
  }
  if (chip === 1) {
    categories.short_game = prevE - afterSwings - 1
    prevE = afterSwings
  }
  if (putts >= 1) categories.putting = afterSwings - putts

  return {
    ...base,
    categories,
    approachStartYds: approachStrokes > 0 ? approachStartYds : null,
    puttEstimated: putts >= 1 && h.firstPuttFt == null,
  }
}
