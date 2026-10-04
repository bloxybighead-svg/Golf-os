// The planner's ranking with the on-course spread and the long-hole look-ahead,
// and the card's two options built from it.

import type { Lookahead } from "./lookahead"
import { rankClubsOptimized, type ClubShots, type OptimizedClubPlan, type PlanContext, type RankOptions } from "./plan"
import { lowestAndSafer, pctText, penaltyShare, widenShots, type Options } from "./strategy"

export interface SpreadRankOptions extends RankOptions {
  /** The offline-spread multiplier applied to every club (ON_COURSE_SPREAD or the golfer's setting). */
  spread: number
  /** Supplies the look-ahead grid for the (widened) bag, or null: long holes, from the tee. */
  lookahead?: (clubs: ClubShots[]) => Lookahead | null
}

/** Every club at its own best aim with the spread applied, fewest expected strokes first. */
export function rankWithSpread(clubs: ClubShots[], ctx: PlanContext, opts: SpreadRankOptions): OptimizedClubPlan[] {
  const bag = clubs.map((c) => widenShots(c, opts.spread))
  const look = opts.lookahead?.(bag) ?? null
  return rankClubsOptimized(bag, { ...ctx, valueAt: look?.valueAt }, opts)
}

/** The card's two options from a ranking. */
export function optionsFor(ranking: OptimizedClubPlan[]): Options<OptimizedClubPlan> | null {
  return lowestAndSafer(ranking, (r) => ({ strokes: r.plan.expectedStrokes, penalty: penaltyShare(r.plan) }))
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
