// Two options for every shot, from one ranking:
//  - GO FOR IT: the club with the fewest expected strokes to hole out, at its
//    own best aim. No safety limit.
//  - SMART PLAY (the default): the club and aim with the lowest
//    expectedStrokes + riskStrokes * penaltyShare, where penaltyShare is the
//    share of shots out of bounds or in water. Every extra point of penalty
//    costs a smooth amount, so a club never flips on a tiny change. Trees are
//    already scored by cost.ts (the recovery column); they are shown as
//    troubleShare but are not in this objective. Each club is first aimed by
//    the same objective. A club + aim above SMART_MAX_PENALTY_RATE is only
//    chosen when nothing is under it.
// The card shows both and the golfer taps the one that fits how they feel.
// Both come from the SAME model: shots are scored with the golfer's misses
// widened to on-course reality (ON_COURSE_SPREAD), so a club's numbers never
// change between the two options, only the aim it is played at.
//
// Every tunable number is here, labelled with where it came from. None is
// measured: they are the golfer-facing judgement calls this feature rests on.

import type { ClubShots } from "./plan"

/**
 * What one unit of penalty share costs Smart play, in strokes: 1.5 means a club with 10% more shots out of bounds or
 * in water has to save 0.15 strokes to be worth it. ESTIMATE: a stroke-and-distance or drop penalty is one stroke plus
 * the lost position, which the strokes table does not charge in full. The golfer sets 0.5 to 3.0 on You -> Planner.
 */
export const SMART_RISK_STROKES = 1.5

/** The three stops of the You -> Planner "Risk" setting. ESTIMATE: Normal is SMART_RISK_STROKES, the others half and double. */
export const RISK_STOPS = [
  { label: "Aggressive", strokes: 0.5 },
  { label: "Normal", strokes: SMART_RISK_STROKES },
  { label: "Conservative", strokes: 3.0 },
] as const

/**
 * Backstop on Smart play: a club + aim with more than this share of shots out of bounds or in water is only chosen
 * when nothing is under it. Also the line the card and table flag in red. ESTIMATE: 1 in 10.
 */
export const SMART_MAX_PENALTY_RATE = 0.1

export interface SmartRule {
  riskStrokes: number
  maxPenalty: number
}

export const smartRule = (riskStrokes: number = SMART_RISK_STROKES): SmartRule => ({ riskStrokes, maxPenalty: SMART_MAX_PENALTY_RATE })

/** Smart play's objective (lower is better): expected strokes plus the strokes the penalty share is worth. */
export const smartCost = (strokes: number, penalty: number, riskStrokes: number): number => strokes + riskStrokes * penalty

/**
 * Every club's offline spread (start line + curve) is multiplied by this before scoring.
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
/** Most next-shot valuations (one per playable lie per cell) a grid may need: twice the cell cap, so lies cost at most 2x the one-lie grid. SPEED SETTING. */
export const LOOKAHEAD_MAX_VALUATIONS = 2 * LOOKAHEAD_MAX_CELLS

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

// ---- The two options ------------------------------------------------------

/** Share of a plan's finishing spots that cost a penalty stroke: out of bounds and water. */
export function penaltyShare(plan: { lieShare: { oob: number; water: number } }): number {
  return plan.lieShare.oob + plan.lieShare.water
}

/** Share finishing in trees. Shown beside the penalty, not part of it: cost.ts already charges trees the recovery column. */
export function troubleShare(plan: { lieShare: { trees?: number } }): number {
  return plan.lieShare.trees ?? 0
}

/** Offline spread x `spread` about each club's own mean offline: wider misses, same natural bias. */
export function widenShots(club: ClubShots, spread: number): ClubShots {
  if (spread === 1 || club.shots.length === 0) return club
  const mean = club.shots.reduce((a, s) => a + s.offlineYds, 0) / club.shots.length
  return { club: club.club, shots: club.shots.map((s) => ({ carryYds: s.carryYds, offlineYds: mean + (s.offlineYds - mean) * spread })) }
}

export interface Options<T> {
  /** GO FOR IT: the fewest expected strokes. */
  lowest: T
  /** SMART PLAY (the default): the lowest smartCost, among the options within SMART_MAX_PENALTY_RATE when any are. */
  safer: T
  /** Smart play and Go for it are the same play (same club, same aim), so there is only one option. */
  same: boolean
}

/**
 * The two options. `ranking` is every club at its strokes-best aim (Go for it); `smartRanking` is every club at its
 * Smart-play aim (the same clubs, aimed away from trouble) and defaults to `ranking`.
 * Go for it = fewest strokes. Smart play = lowest smartCost among those with penalty <= rule.maxPenalty, or among
 * all of them when none is.
 */
export function lowestAndSafer<T>(
  ranking: T[],
  view: (t: T) => { strokes: number; penalty: number },
  smartRanking: T[] = ranking,
  sameChoice: (a: T, b: T) => boolean = (a, b) => a === b,
  rule: SmartRule = smartRule()
): Options<T> | null {
  if (ranking.length === 0 || smartRanking.length === 0) return null
  const go = ranking.map((o) => ({ o, ...view(o) })).reduce((a, b) => (b.strokes < a.strokes ? b : a))
  const sm = smartRanking.map((o) => {
    const v = view(o)
    return { o, ...v, cost: smartCost(v.strokes, v.penalty, rule.riskStrokes) }
  })
  const eligible = sm.filter((x) => x.penalty <= rule.maxPenalty + 1e-9)
  const smart = (eligible.length > 0 ? eligible : sm).reduce((a, b) => (b.cost < a.cost ? b : a))
  return { lowest: go.o, safer: smart.o, same: sameChoice(smart.o, go.o) }
}

/** "3%" style, whole percent; under half a percent shows "<1%" so a small risk never reads as none. */
export function pctText(share: number): string {
  if (share <= 0) return "0%"
  const p = share * 100
  return p < 0.5 ? "<1%" : `${Math.round(p)}%`
}

/** What most of the penalty is: "OB" or "water". */
export function penaltyWord(plan: { lieShare: { oob: number; water: number } }): string {
  return plan.lieShare.oob >= plan.lieShare.water ? "OB" : "water"
}

/** The look-ahead grid only covers where a tee shot can finish: from this far from the tee. ESTIMATE: nobody tees off with less than a long iron on a par 5. */
export const LOOKAHEAD_MIN_TEE_YDS = 120

/** ...out to this multiple of the longest club's carry (carry + roll + a long one). ESTIMATE. */
export const LOOKAHEAD_MAX_TEE_FACTOR = 1.15
