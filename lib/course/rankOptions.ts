// The planner's ranking with the on-course spread and the long-hole look-ahead,
// and the card's two options built from it.

import type { Lookahead } from "./lookahead"
import { rankClubsOptimized, type ClubShots, type OptimizedClubPlan, type PlanContext, type RankOptions } from "./plan"
import { SMART_MAX_PENALTY_RATE, lowestAndSafer, pctText, penaltyShare, widenShots, type Options } from "./strategy"

export interface SpreadRankOptions extends RankOptions {
  /** The offline-spread multiplier applied to every club (ON_COURSE_SPREAD or the golfer's setting). */
  spread: number
  /** Supplies the look-ahead grid for the (widened) bag, or null: long holes, from the tee. */
  lookahead?: (clubs: ClubShots[]) => Lookahead | null
}

/** Smart play's penalty limit, handed to the aim search (see strategy.ts). */
export const SMART_RANK_OPTIONS = { maxPenalty: SMART_MAX_PENALTY_RATE } as const

/** Every club at its own best aim with the spread applied, fewest expected strokes first. */
export function rankWithSpread(clubs: ClubShots[], ctx: PlanContext, opts: SpreadRankOptions): OptimizedClubPlan[] {
  const bag = clubs.map((c) => widenShots(c, opts.spread))
  const look = opts.lookahead?.(bag) ?? null
  return rankClubsOptimized(bag, { ...ctx, valueAt: look?.valueAt }, { ...SMART_RANK_OPTIONS, ...opts })
}

/** Go for it's rows: every club at its strokes-best aim. */
export function goRows(ranking: OptimizedClubPlan[]): OptimizedClubPlan[] {
  return ranking.map((r) => ({ ...r, strategy: "go" as const }))
}

/** Smart play's rows: every club at its Smart-play aim (aimed away from trouble), fewest strokes first. A ranking made without `maxPenalty` has no such aim, so its rows are the strokes-best ones. */
export function smartRows(ranking: OptimizedClubPlan[]): OptimizedClubPlan[] {
  return ranking
    .map((r) => (r.safe ? { ...r, bearingDeg: r.safe.bearingDeg, offsetYds: r.safe.offsetYds, plan: r.safe.plan } : r))
    .map((r) => ({ ...r, strategy: "smart" as const }))
    .sort((a, b) => a.plan.expectedStrokes - b.plan.expectedStrokes)
}

const sameAim = (a: OptimizedClubPlan, b: OptimizedClubPlan) => a.club === b.club && Math.abs(a.bearingDeg - b.bearingDeg) < 1e-6

/** The card's two options from a ranking made with `maxPenalty: SMART_MAX_PENALTY_RATE`. */
export function optionsFor(ranking: OptimizedClubPlan[]): Options<OptimizedClubPlan> | null {
  const view = (r: OptimizedClubPlan) => ({ strokes: r.plan.expectedStrokes, penalty: penaltyShare(r.plan) })
  return lowestAndSafer(goRows(ranking), view, smartRows(ranking), sameAim)
}

/**
 * "Smart play: 4-Iron, 1% penalty, 4.73. Go for it: Driver, 6% penalty, 4.43. Smart play costs +0.30 and cuts
 * penalty risk 6% -> 1%." Null when there is only one option.
 */
export function tradeoffText(o: Options<OptimizedClubPlan>): string | null {
  if (o.same) return null
  const go = o.lowest
  const smart = o.safer
  const pg = penaltyShare(go.plan)
  const ps = penaltyShare(smart.plan)
  const cost = smart.plan.expectedStrokes - go.plan.expectedStrokes
  return (
    `Smart play: ${smart.club}, ${pctText(ps)} penalty, ${smart.plan.expectedStrokes.toFixed(2)}. ` +
    `Go for it: ${go.club}, ${pctText(pg)} penalty, ${go.plan.expectedStrokes.toFixed(2)}. ` +
    `Smart play costs ${cost >= 0 ? "+" : "-"}${Math.abs(cost).toFixed(2)} and cuts penalty risk ${pctText(pg)} -> ${pctText(ps)}.`
  )
}
