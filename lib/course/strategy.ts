// Two ways to play a shot, and every number that separates them.
//
//  - PAR (the default): blow-up risk counts. Any club/aim whose penalty share
//    (ball stops out of bounds or in water) is over PENALTY_CAP is left out
//    when at least one option is under it. The rest are ranked by expected
//    strokes + PENALTY_WEIGHT x penalty share, and a longer club only wins if
//    it beats a shorter, safer one by LONGER_CLUB_MARGIN. Shots are scored with
//    the spread widened to on-course reality (ON_COURSE_SPREAD).
//  - GO FOR IT: pure expected strokes on the raw (launch-monitor) dispersion.
//
// Why: expected strokes alone accepts a 7% OB chance for a 0.04-stroke edge,
// and range data is tighter than the same golfer's rounds. Every tunable number
// is here, labelled with where it came from. None is measured: they are the
// golfer-facing judgement calls this feature rests on, so change them here.

import type { ClubShots } from "./plan"

/** A club/aim with more than this share of shots out of bounds or in water is dropped in Par mode. ESTIMATE (spec): 1 in 33. */
export const PENALTY_CAP = 0.03

/** A shorter club only counts as "safer" if its penalty share is lower by at least this (0.5 points). ESTIMATE: below that, "safer" is one ball in 200 shots, i.e. sampling noise, and with no penalty risk anywhere Par must agree with Go for it. */
export const SAFER_MIN_GAP = 0.005

/** Strokes added per unit penalty share when ranking in Par mode (share is a fraction: 7% adds 0.035). ESTIMATE (spec): the cap and the margin do the real work. */
export const PENALTY_WEIGHT = 0.5

/** A longer club only beats a shorter, safer one in Par mode if it gains this many strokes after penalty weighting. ESTIMATE (spec): about the sampling noise of a ranking. */
export const LONGER_CLUB_MARGIN = 0.1

/**
 * Par mode multiplies each club's offline spread (start line + curve) by this.
 * ESTIMATE: range/launch-monitor data is tighter than the same golfer on the
 * course (wind, lies, nerves, no mat). 1.25 is the spec's starting value; the
 * golfer can set 1.0-1.5 on You -> Planner.
 */
export const ON_COURSE_SPREAD = 1.25
export const SPREAD_MIN = 1.0
export const SPREAD_MAX = 1.5
export const SPREAD_STEP = 0.05

// ---- Look ahead (par 5s and long par 4s) ----------------------------------

/** Holes this long (par 4) or any par 5 get the one-shot look-ahead. ESTIMATE (spec): where the green is out of reach in two. */
export const LOOKAHEAD_PAR4_MIN_YDS = 440

/** Next-shot samples per club per aim. SPEED SETTING: more is smoother and slower. */
export const LOOKAHEAD_SAMPLES = 60

/** Lateral aims tried per club for the next shot, yards at the club's reach (relative to the line to the pin). SPEED SETTING. */
export const LOOKAHEAD_AIM_OFFSETS = [-12, 0, 12] as const

/** Only this many clubs per cell are tried: the ones whose reach is closest to the distance left. SPEED SETTING. */
export const LOOKAHEAD_MAX_CLUBS = 3

/** Look-ahead grid cell size, yards: the larger of this and what keeps the grid under LOOKAHEAD_MAX_CELLS. SPEED SETTING. */
export const LOOKAHEAD_CELL_YDS = 16
export const LOOKAHEAD_MAX_CELLS = 160

/** How far either side of the hole line the look-ahead grid reaches, yards. A tee shot finishing farther out is valued with the plain table. */
export const LOOKAHEAD_LATERAL_YDS = 60

/** Seed for which shots the look-ahead samples, so the grid repeats. */
export const LOOKAHEAD_SEED = 29

/** True when the hole is long enough that the tee shot should be valued by what it leaves for the next one. */
export function needsLookahead(par: number | null | undefined, yards: number | null | undefined): boolean {
  if (par == null) return false
  return par >= 5 || (par === 4 && (yards ?? 0) > LOOKAHEAD_PAR4_MIN_YDS)
}

// ---- OB tags -------------------------------------------------------------

/** How far past the fairway edge the OB stakes sit when the golfer taps "OB left/right/long". ESTIMATE: a typical rough strip; adjustable per hole. */
export const OB_MARGIN_YDS = 15
export const OB_MARGIN_MIN_YDS = 0
export const OB_MARGIN_MAX_YDS = 60

/** Half-width of a fairway when none is mapped, yards. ESTIMATE: matches the 32 yd estimated corridor in dataQuality.ts. */
export const OB_DEFAULT_FAIRWAY_HALF_WIDTH_YDS = 16

/** Depth of the OB band behind the fairway edge + margin, yards. Deep enough that no shot clears it. */
export const OB_BAND_DEPTH_YDS = 120

/** The OB band starts this far from the tee, yards (the tee box itself is never OB). ESTIMATE. */
export const OB_BAND_START_YDS = 30

/** How far past the green the "OB long" band starts, yards. ESTIMATE: a typical apron behind the green. */
export const OB_LONG_PAST_GREEN_YDS = 25

/** The "No OB mapped" banner looks this far either side of the hole line for any out-of-bounds ground, yards. ESTIMATE: wider than the fairway and its rough. */
export const OB_SCAN_HALF_WIDTH_YDS = 60

// ---- Strategy and picking -------------------------------------------------

export type Strategy = "par" | "go"
export const DEFAULT_STRATEGY: Strategy = "par"

/** Strategy resets to Par on every NEW hole; re-picking the same hole (a data refresh) keeps it. */
export function strategyAfterHolePick(prev: Strategy, previousHoleId: string | null, nextHoleId: string): Strategy {
  return previousHoleId === nextHoleId ? prev : DEFAULT_STRATEGY
}

/** What the picking rules need to know about a club's plan. */
export interface PickView {
  club: string
  /** Expected strokes to hole out (this shot included). */
  strokes: number
  /** Share of shots that stop out of bounds or in water, 0..1. */
  penalty: number
  /** How far the average shot finishes (carry + roll). */
  reach: number
}

/** Out-of-bounds + water share of a plan's finishing spots. */
export function penaltyShare(plan: { lieShare: { oob: number; water: number } }): number {
  return plan.lieShare.oob + plan.lieShare.water
}

/** Expected strokes plus the Par-mode penalty weighting. */
export function weighted(v: Pick<PickView, "strokes" | "penalty">): number {
  return v.strokes + PENALTY_WEIGHT * v.penalty
}

/** Offline spread x `spread` about each club's own mean offline: wider misses, same natural bias. */
export function widenShots(club: ClubShots, spread: number): ClubShots {
  if (spread === 1 || club.shots.length === 0) return club
  const mean = club.shots.reduce((a, s) => a + s.offlineYds, 0) / club.shots.length
  return { club: club.club, shots: club.shots.map((s) => ({ carryYds: s.carryYds, offlineYds: mean + (s.offlineYds - mean) * spread })) }
}

export interface ParPick<T> {
  chosen: T
  /** True when every option was over the cap: chosen is simply the lowest-penalty one. */
  allOverCap: boolean
  /** The longer club that lost to a shorter, safer one on the margin rule (null when nothing was displaced). */
  displaced: { club: T; gain: number; extraPenalty: number } | null
}

/**
 * Par mode's pick from every club (each at its own best aim).
 * 1. Drop options over PENALTY_CAP if any is under it; if none is, take the
 *    lowest penalty share (ties: lower weighted strokes).
 * 2. Best weighted strokes among what's left.
 * 3. Tie to the safer club: if a shorter club with clearly less penalty (SAFER_MIN_GAP) is within
 *    LONGER_CLUB_MARGIN of the best (weighted strokes), the closest such club wins.
 */
export function pickPar<T>(options: T[], view: (t: T) => PickView): ParPick<T> | null {
  if (options.length === 0) return null
  const v = options.map((o) => ({ o, v: view(o) }))
  const under = v.filter((x) => x.v.penalty <= PENALTY_CAP)
  const allOverCap = under.length === 0
  let pool = under
  if (allOverCap) {
    const lowest = Math.min(...v.map((x) => x.v.penalty))
    pool = v.filter((x) => x.v.penalty - lowest < 1e-9)
  }
  const best = pool.reduce((a, b) => (weighted(b.v) < weighted(a.v) ? b : a))
  if (allOverCap) return { chosen: best.o, allOverCap, displaced: null }

  // Tie goes to the safer club, one step from the best: of the shorter clubs that carry no more penalty risk and are
  // within LONGER_CLUB_MARGIN of the best score, take the closest in score ("Driver gains 0.04, not worth +6% OB. 3-Wood.").
  // It does not chain further down the bag: the best club's gain is measured against its nearest safe alternative.
  const safer = pool.filter((y) => y.v.reach < best.v.reach && best.v.penalty - y.v.penalty >= SAFER_MIN_GAP && weighted(y.v) - weighted(best.v) < LONGER_CLUB_MARGIN)
  if (safer.length === 0) return { chosen: best.o, allOverCap, displaced: null }
  const chosen = safer.reduce((a, b) => (weighted(b.v) < weighted(a.v) ? b : a))
  return {
    chosen: chosen.o,
    allOverCap,
    displaced: { club: best.o, gain: weighted(chosen.v) - weighted(best.v), extraPenalty: best.v.penalty - chosen.v.penalty },
  }
}

/** "3%" style, whole percent; under half a percent shows "<1%" so a small risk never reads as none. */
export function pctText(share: number): string {
  if (share <= 0) return "0%"
  const p = share * 100
  return p < 0.5 ? "<1%" : `${Math.round(p)}%`
}

/** "OB" when out of bounds is the bigger share of the risk, else "water". */
export function penaltyWord(plan: { lieShare: { oob: number; water: number } }): string {
  return plan.lieShare.oob >= plan.lieShare.water ? "OB" : "water"
}

/** The look-ahead grid only covers where a tee shot can finish: from this far from the tee. ESTIMATE: nobody tees off with less than a long iron on a par 5. */
export const LOOKAHEAD_MIN_TEE_YDS = 120

/** ...out to this multiple of the longest club's carry (carry + roll + a long one). ESTIMATE. */
export const LOOKAHEAD_MAX_TEE_FACTOR = 1.15
