// The planner's ranking with the on-course spread and the long-hole look-ahead,
// and the card's two options built from it.

import type { Lookahead } from "./lookahead"
import { rankClubsOptimized, type ClubShots, type OptimizedClubPlan, type PlanContext, type RankOptions } from "./plan"
import { lowestAndSafer, pctText, penaltyShare, penaltyWord, smartRule, widenShots, type Options, type SmartRule } from "./strategy"

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
  return rankClubsOptimized(bag, { ...ctx, valueAt: look?.valueAt }, { smart: smartRule(), ...opts })
}

/** Go for it's rows: every club at its strokes-best aim. */
export function goRows(ranking: OptimizedClubPlan[]): OptimizedClubPlan[] {
  return ranking.map((r) => ({ ...r, strategy: "go" as const }))
}

/** Smart play's rows: every club at its Smart-play aim (aimed away from trouble), fewest strokes first. A ranking made without a Smart-play rule has no such aim, so its rows are the strokes-best ones. */
export function smartRows(ranking: OptimizedClubPlan[]): OptimizedClubPlan[] {
  return ranking
    .map((r) => (r.safe ? { ...r, bearingDeg: r.safe.bearingDeg, offsetYds: r.safe.offsetYds, plan: r.safe.plan } : r))
    .map((r) => ({ ...r, strategy: "smart" as const }))
    .sort((a, b) => a.plan.expectedStrokes - b.plan.expectedStrokes)
}

const sameAim = (a: OptimizedClubPlan, b: OptimizedClubPlan) => a.club === b.club && Math.abs(a.bearingDeg - b.bearingDeg) < 1e-6

/** The card's two options from a ranking made with the same `smart` rule. */
export function optionsFor(ranking: OptimizedClubPlan[], rule: SmartRule = smartRule()): Options<OptimizedClubPlan> | null {
  const view = (r: OptimizedClubPlan) => ({ strokes: r.plan.expectedStrokes, penalty: penaltyShare(r.plan) })
  return lowestAndSafer(goRows(ranking), view, smartRows(ranking), sameAim, rule)
}

/** "Smart play gives up 0.07 strokes to cut OB from 9% to 2%." Null when there is only one option or it cuts no penalty. */
export function tradeoffText(o: Options<OptimizedClubPlan>): string | null {
  if (o.same) return null
  const pg = penaltyShare(o.lowest.plan)
  const ps = penaltyShare(o.safer.plan)
  if (ps >= pg) return null
  const cost = Math.max(0, o.safer.plan.expectedStrokes - o.lowest.plan.expectedStrokes)
  return `Smart play gives up ${cost.toFixed(2)} strokes to cut ${penaltyWord(o.lowest.plan)} from ${pctText(pg)} to ${pctText(ps)}.`
}
