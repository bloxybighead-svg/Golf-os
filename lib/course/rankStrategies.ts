// Ranks the bag twice: Par (spread widened to on-course reality, look-ahead on
// long holes) and Go for it (raw dispersion, pure expected strokes). Both
// rankings are kept so the result card can show the trade-off between them.

import type { Lookahead } from "./lookahead"
import { rankClubsOptimized, type ClubShots, type OptimizedClubPlan, type PlanContext, type RankOptions } from "./plan"
import { PENALTY_CAP, pctText, pickPar, penaltyShare, weighted, widenShots, type ParPick, type Strategy } from "./strategy"

export interface StrategyRankings {
  /** Every club at its own best aim, raw dispersion, best expected strokes first. */
  go: OptimizedClubPlan[]
  /** The same with the spread widened; the Par pick comes from pickPar over this list. */
  par: OptimizedClubPlan[]
}

export interface StrategyOptions extends RankOptions {
  /** Par mode's offline-spread multiplier (ON_COURSE_SPREAD or the golfer's setting). */
  spread: number
  /** Supplies the look-ahead grid for a strategy and its bag (null = none): long holes, from the tee. */
  lookahead?: (strategy: Strategy, clubs: ClubShots[]) => Lookahead | null
}

export function rankBothStrategies(clubs: ClubShots[], ctx: PlanContext, opts: StrategyOptions): StrategyRankings {
  const run = (strategy: Strategy): OptimizedClubPlan[] => {
    const bag = strategy === "par" ? clubs.map((c) => widenShots(c, opts.spread)) : clubs
    const look = opts.lookahead?.(strategy, bag) ?? null
    return rankClubsOptimized(bag, { ...ctx, valueAt: look?.valueAt }, opts)
  }
  return { go: run("go"), par: run("par") }
}

/** Par mode's pick (and why) over a Par ranking. */
export function parPick(par: OptimizedClubPlan[]): ParPick<OptimizedClubPlan> | null {
  return pickPar(par, (r) => ({ club: r.club, strokes: r.plan.expectedStrokes, penalty: penaltyShare(r.plan), reach: r.plan.meanTotalYds }))
}

export interface ParDecision {
  /** The table order: the pick first, then the clubs under the cap (best weighted strokes first), then those over it. */
  ordered: OptimizedClubPlan[]
  pick: OptimizedClubPlan
  /** Every option was over the cap: pick is just the lowest-penalty one. */
  allOverCap: boolean
  /** A longer club that lost to a shorter, safer one on the margin rule. */
  displaced: ParPick<OptimizedClubPlan>["displaced"]
}

/** Par mode over a Par ranking: who to pick and how to order the table. Null for an empty ranking. */
export function decidePar(par: OptimizedClubPlan[]): ParDecision | null {
  const p = parPick(par)
  if (!p) return null
  const rest = par.filter((r) => r !== p.chosen)
  const key = (r: OptimizedClubPlan) => weighted({ strokes: r.plan.expectedStrokes, penalty: penaltyShare(r.plan) })
  const under = rest.filter((r) => penaltyShare(r.plan) <= PENALTY_CAP).sort((a, b) => key(a) - key(b))
  const over = rest.filter((r) => penaltyShare(r.plan) > PENALTY_CAP).sort((a, b) => penaltyShare(a.plan) - penaltyShare(b.plan) || key(a) - key(b))
  return { ordered: [p.chosen, ...under, ...over], pick: p.chosen, allOverCap: p.allOverCap, displaced: p.displaced }
}

/** The card's "Par play ... Go for it ..." line. Null when both strategies pick the same club. */
export function tradeoffText(par: OptimizedClubPlan, go: OptimizedClubPlan): string | null {
  if (par.club === go.club) return null
  const pp = penaltyShare(par.plan)
  const gp = penaltyShare(go.plan)
  const cost = par.plan.expectedStrokes - go.plan.expectedStrokes
  return (
    `Par play: ${par.club}, ${pctText(pp)} penalty, ${par.plan.expectedStrokes.toFixed(2)}. ` +
    `Go for it: ${go.club}, ${pctText(gp)} penalty, ${go.plan.expectedStrokes.toFixed(2)}. ` +
    `Par play costs ${cost >= 0 ? "+" : "-"}${Math.abs(cost).toFixed(2)} and ${gp > pp ? `cuts penalty risk ${pctText(gp)} -> ${pctText(pp)}` : `changes penalty risk ${pctText(gp)} -> ${pctText(pp)}`}.`
  )
}
