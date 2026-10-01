// The strokes-to-hole-out baseline the planner scores against: the PGA TOUR
// (cost.ts, Broadie's published tables) or a golfer of a given handicap.
//
// No published table of AMATEUR strokes to hole out by lie and distance
// could be verified (Every Shot Counts tabulates tour pros only), so the
// handicap baseline is the tour table adjusted with a few cited anchor
// points plus labelled estimates:
//  1. A base offset, worse from everywhere, shaped by distance like the gap
//     between Broadie's published tee-shot lines for 90-golfers and tour pros,
//     and sized so a typical par-72 round from the tees totals 72 + handicap.
//  2. The tour's lie penalty (rough, sand, trees vs fairway at the same
//     distance), scaled up with handicap (estimate).
//  3. Putting: a golfer putts like a tour pro from a longer distance, by the
//     cited 19 ft vs 33 ft two-putt distances.
// Sources:
//  - Broadie, "Assessing Golfer Performance on the PGA TOUR", Interfaces
//    42(2), 2012 (working paper 2011-04-08), sections 3.1 and 3.3:
//    https://columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf
//  - Broadie, "Assessing Golfer Performance Using Golfmetrics", Science and
//    Golf V (2008), Tables 1-4:
//    http://www.columbia.edu/~mnb2/broadie/Assets/broadie_wscg_v_200804.pdf
// Note from that 2008 paper: in Broadie's own data the rough hurt pros MORE
// than amateurs (largely heavy tournament rough), so LIE_PENALTY_PER_HCP is
// the least certain number here.

import {
  expectedFromStart as tourFromStart,
  expectedStrokesRemaining as tourRemaining,
  tourExpected,
  tourPutting,
  type BaselineLie,
  type StartLie,
} from "./cost"
import type { Lie } from "./lies"

export interface Baseline {
  /** The handicap this baseline is for; null = PGA TOUR. */
  handicap: number | null
  /** "PGA TOUR" or "3.0 handicap", for labels. */
  label: string
  /** Expected strokes remaining after a shot ends in `lie` (see cost.ts for the penalty rules). */
  expectedStrokesRemaining(
    lie: Lie,
    distToPinYds: number,
    origin?: { distYds: number; lie: StartLie },
    waterDropDistYds?: number
  ): number
  /** Expected strokes remaining from where the golfer stands (the tee has its own column). */
  expectedFromStart(lie: StartLie, distToPinYds: number): number
  /** Expected strokes from the fairway at this distance (what the trouble map compares against). */
  fairway(distYds: number): number
}

/** The PGA TOUR baseline: exactly the cost.ts functions, unchanged. */
export const TOUR_BASELINE: Baseline = {
  handicap: null,
  label: "PGA TOUR",
  expectedStrokesRemaining: tourRemaining,
  expectedFromStart: tourFromStart,
  fairway: (d) => tourExpected("fairway", d),
}

// ---- Cited anchors -------------------------------------------------------

/** Average score from the tee, J = intercept + perYd x hole length, for PGA TOUR pros (Interfaces 2012, 3.1). */
export const TOUR_TEE_LINE = { intercept: 2.38, perYd: 0.0041 }
/** The same for 90-golfers (18-hole average score 90; Broadie 2008, quoted in Interfaces 2012, 3.1). */
export const GOLFER90_TEE_LINE = { intercept: 2.79, perYd: 0.0066 }
/** Distance (ft) from which golfers average exactly two putts: tour 33, 90-golfer 19 (Interfaces 2012, 3.3). */
export const TWO_PUTT_FT = { tour: 33, golfer90: 19 }

// ---- Estimates -----------------------------------------------------------

/**
 * The handicap index of a "90-golfer". ESTIMATE: average scores run about
 * 3 strokes above what a handicap implies (WHS uses the best 8 of 20), so an
 * average of 90 on a par-72, ~71-rated course is about 90 - 71 - 3 = 16.
 */
export const GOLFER90_HANDICAP = 16

/** How much a handicap stroke scales the tour's rough / sand / trees penalty. ESTIMATE: a 10 pays 1.3x, a 20 pays 1.6x. */
export const LIE_PENALTY_PER_HCP = 0.03

/**
 * Amateur sand is at least this many times the rough penalty at the same
 * distance. ESTIMATE, from a cited direction: tour pros save par from sand
 * 50% of the time vs 26% / 17% / 7% for low / mid / high handicaps
 * (Broadie 2008, Table 1), so the tour's "sand is easier than rough at
 * 15-34 yd" doesn't carry over to amateurs.
 */
export const AMATEUR_SAND_VS_ROUGH_MIN = 1.1

/**
 * Putting: an h-handicap putts like a tour pro from (1 + h x this) times the
 * distance. From the cited two-putt distances: a 90-golfer (~16 handicap,
 * estimate) two-putts from 19 ft, a tour pro from 33 ft, so 33/19 = 1.74 at
 * h = 16. Cross-check: Broadie 2008 Table 1 has low handicaps (scores
 * 70-83) at 25 ft vs pros 30 ft, a 1.2 stretch, about what this gives at h = 4.
 */
export const PUTT_STRETCH_PER_HCP = (TWO_PUTT_FT.tour / TWO_PUTT_FT.golfer90 - 1) / GOLFER90_HANDICAP

/** The reference round the base offset is sized on: a typical par-72, 6,500 yd layout (ESTIMATE of "typical"). */
export const REFERENCE_ROUND: readonly { par: number; yds: number }[] = [
  ...Array.from({ length: 4 }, () => ({ par: 3, yds: 165 })),
  ...Array.from({ length: 10 }, () => ({ par: 4, yds: 380 })),
  ...Array.from({ length: 4 }, () => ({ par: 5, yds: 510 })),
]

// ---- The model -------------------------------------------------------------

/** Shape of the extra strokes over distance: the 90-golfer line minus the tour line. */
function offsetShape(distYds: number): number {
  const a = GOLFER90_TEE_LINE.intercept - TOUR_TEE_LINE.intercept
  const b = GOLFER90_TEE_LINE.perYd - TOUR_TEE_LINE.perYd
  return a + b * Math.max(0, distYds)
}

const REFERENCE_PAR = REFERENCE_ROUND.reduce((s, h) => s + h.par, 0)
const ROUND_SHAPE = REFERENCE_ROUND.reduce((s, h) => s + offsetShape(h.yds), 0)
const TOUR_ROUND = REFERENCE_ROUND.reduce((s, h) => s + tourExpected("tee", h.yds), 0)

/**
 * How many strokes a scratch golfer loses to a tour pro over the reference
 * round: par (a course rating is the scratch score) minus the tour's
 * expected total from the same tees. Computed, about 2.5.
 */
export const SCRATCH_VS_TOUR_STROKES = REFERENCE_PAR - TOUR_ROUND

/** Extra strokes an h-handicap needs from `distYds`, before any lie penalty. */
function baseOffset(distYds: number, h: number): number {
  return ((SCRATCH_VS_TOUR_STROKES + h) * offsetShape(distYds)) / ROUND_SHAPE
}

function offGreen(lie: BaselineLie, d: number, h: number): number {
  const fairway = tourExpected("fairway", d)
  let gap = 0
  if (lie === "rough" || lie === "sand" || lie === "recovery") {
    gap = tourExpected(lie, d) - fairway
    if (lie === "sand") gap = Math.max(gap, AMATEUR_SAND_VS_ROUGH_MIN * (tourExpected("rough", d) - fairway))
    gap *= Math.max(0, 1 + LIE_PENALTY_PER_HCP * h)
  }
  const start = lie === "tee" ? tourExpected("tee", d) : fairway
  return start + gap + baseOffset(d, h)
}

function putting(feet: number, h: number): number {
  return tourPutting(feet * Math.max(0.5, 1 + PUTT_STRETCH_PER_HCP * h))
}

function handicapBaseline(h: number): Baseline {
  const fromStart = (lie: StartLie, d: number): number => (lie === "tee" ? offGreen("tee", d, h) : remaining(lie, d))
  function remaining(
    lie: Lie,
    d: number,
    origin: { distYds: number; lie: StartLie } = { distYds: d, lie: "fairway" },
    waterDropDistYds?: number
  ): number {
    switch (lie) {
      case "green":
        return putting(d * 3, h)
      case "fairway":
        return offGreen("fairway", d, h)
      case "rough":
        return offGreen("rough", d, h)
      case "bunker":
        return offGreen("sand", d, h)
      case "trees":
        return offGreen("recovery", d, h)
      case "water":
        return 1 + offGreen("fairway", waterDropDistYds ?? d, h)
      case "oob":
        return 1 + fromStart(origin.lie, origin.distYds)
    }
  }
  return {
    handicap: h,
    label: `${h.toFixed(1)} handicap`,
    expectedStrokesRemaining: remaining,
    expectedFromStart: fromStart,
    fairway: (d) => offGreen("fairway", d, h),
  }
}

const cache = new Map<number, Baseline>()

/** The baseline to score against: a handicap, or null for the PGA TOUR. */
export function getBaseline(handicap: number | null): Baseline {
  if (handicap == null || !Number.isFinite(handicap)) return TOUR_BASELINE
  const h = Math.round(handicap * 10) / 10
  let b = cache.get(h)
  if (!b) {
    b = handicapBaseline(h)
    cache.set(h, b)
  }
  return b
}

/** Handicap the planner scores a guest (or anyone without one) against. */
export const DEFAULT_BASELINE_HANDICAP = 10

/** Which baseline the golfer chose: their handicap (default) or the tour. Saved per device. */
export type CompareAgainst = "handicap" | "tour"
export const COMPARE_AGAINST_KEY = "golfos.compareAgainst.v1"
/** Fired on window when the choice changes in this tab (the storage event only reaches other tabs). */
export const COMPARE_AGAINST_EVENT = "golfos:compare-against"

export function readCompareAgainst(): CompareAgainst {
  try {
    return localStorage.getItem(COMPARE_AGAINST_KEY) === "tour" ? "tour" : "handicap"
  } catch {
    return "handicap"
  }
}

export function saveCompareAgainst(v: CompareAgainst): void {
  try {
    localStorage.setItem(COMPARE_AGAINST_KEY, v)
  } catch {
    // private mode etc.: the choice just won't stick
  }
  try {
    window.dispatchEvent(new Event(COMPARE_AGAINST_EVENT))
  } catch {
    // no window (tests)
  }
}
