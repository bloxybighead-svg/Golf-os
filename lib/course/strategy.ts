// Two options for every shot, from one ranking:
//  - GO FOR IT: the club with the fewest expected strokes to hole out.
//  - SMART PLAY (the default): the balance between strokes and safety. Every
//    club is scored as its expected strokes plus SMART_RISK_WEIGHT per unit of
//    penalty share (finishing out of bounds, in water or in trees: a drop, a
//    punch-out or a lost ball), and smart play is the best of those among
//    clubs that give up no more than SMART_MAX_COST strokes to Go for it.
//    So it backs off a club or two when the risk is real, and never lays back
//    far. When Go for it already scores best that way, there is one option.
// The card shows both and the golfer taps the one that fits how they feel.
// Both come from the SAME model: shots are scored with the golfer's misses
// widened to on-course reality (ON_COURSE_SPREAD), so a club's numbers never
// change between the two options.
//
// Every tunable number is here, labelled with where it came from. None is
// measured: they are the golfer-facing judgement calls this feature rests on.

import type { ClubShots } from "./plan"

/** Penalty share above this is flagged red on the card and in the table, and the card warns when even smart play is above it. ESTIMATE (spec): 1 in 33. */
export const PENALTY_CAP = 0.03

/**
 * Strokes smart play adds per unit of penalty share when it weighs safety against strokes (a share is a fraction:
 * 10% adds 0.15). ESTIMATE: the strokes table already charges the average cost of an out of bounds or recovery shot,
 * and this is the premium on top for the blow-up (the extra stroke or two of a lost ball, a punch-out that stays in
 * the trees), which an average hides. 1.5 puts Driver at 23% penalty behind a 3-Wood at 6% unless the Driver is
 * more than about a quarter stroke better.
 */
export const SMART_RISK_WEIGHT = 1.5

/**
 * Smart play never gives up more than this many expected strokes to Go for it. ESTIMATE: laying back too far is a
 * worse plan than the risk it avoids, so the safer option has to stay close.
 */
export const SMART_MAX_COST = 0.35

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

/**
 * Share of a plan's finishing spots that cost a penalty or a punch-out: out of bounds, water and TREES. A ball in
 * the trees is treated as a drop, a punch-out or a lost ball, not a playable lie, so it counts as risk even though
 * the strokes table scores it as "recovery".
 */
export function penaltyShare(plan: { lieShare: { oob: number; water: number; trees?: number } }): number {
  return plan.lieShare.oob + plan.lieShare.water + (plan.lieShare.trees ?? 0)
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
  /** SMART PLAY (the default); the same club as `lowest` when nothing beats it once risk is weighed in. */
  safer: T
  /** `lowest` is already the best balance, so there is only one option. */
  same: boolean
  /** Even smart play has more than PENALTY_CAP penalty risk: the card warns. */
  noSafeOption: boolean
}

/** Expected strokes plus the risk premium. */
export function balanced(v: { strokes: number; penalty: number }): number {
  return v.strokes + SMART_RISK_WEIGHT * v.penalty
}

/**
 * The two options from a ranking (each club at its own best aim) in any order.
 * Go for it = fewest strokes. Smart play = the best `balanced` score among the
 * clubs within SMART_MAX_COST strokes of it (ties: the one with less penalty).
 */
export function lowestAndSafer<T>(ranking: T[], view: (t: T) => { strokes: number; penalty: number }): Options<T> | null {
  if (ranking.length === 0) return null
  const v = ranking.map((o) => ({ o, ...view(o) }))
  const lowest = v.reduce((a, b) => (b.strokes < a.strokes ? b : a))
  const near = v.filter((x) => x.strokes - lowest.strokes <= SMART_MAX_COST + 1e-9)
  const smart = near.reduce((a, b) => {
    const d = balanced(b) - balanced(a)
    return d < -1e-9 || (Math.abs(d) <= 1e-9 && b.penalty < a.penalty) ? b : a
  })
  return { lowest: lowest.o, safer: smart.o, same: smart === lowest, noSafeOption: smart.penalty > PENALTY_CAP }
}

/** "3%" style, whole percent; under half a percent shows "<1%" so a small risk never reads as none. */
export function pctText(share: number): string {
  if (share <= 0) return "0%"
  const p = share * 100
  return p < 0.5 ? "<1%" : `${Math.round(p)}%`
}

/** What most of the risk is: "OB", "water" or "trees". */
export function penaltyWord(plan: { lieShare: { oob: number; water: number; trees?: number } }): string {
  const { oob, water, trees = 0 } = plan.lieShare
  if (oob >= water && oob >= trees) return "OB"
  return water >= trees ? "water" : "trees"
}

/** The look-ahead grid only covers where a tee shot can finish: from this far from the tee. ESTIMATE: nobody tees off with less than a long iron on a par 5. */
export const LOOKAHEAD_MIN_TEE_YDS = 120

/** ...out to this multiple of the longest club's carry (carry + roll + a long one). ESTIMATE. */
export const LOOKAHEAD_MAX_TEE_FACTOR = 1.15
