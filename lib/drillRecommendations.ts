import type { CategoryTrend, SgCategory } from "./sgBenchmarks"
import type { SgSummary } from "./rounds/strokesGained"

export const CATEGORY_LABEL: Record<SgCategory, string> = {
  off_tee: "Off-Tee",
  approach: "Approach",
  short_game: "Short Game",
  putting: "Putting",
}

/** The order the drill picker lists them in. */
export const DRILL_CATEGORIES: readonly SgCategory[] = ["putting", "approach", "off_tee", "short_game"]

/**
 * What drills are picked from: strokes gained from recorded shots against the
 * golfer's own handicap when there are some, else the scorecard estimate.
 */
export function drillTrends(real: SgSummary | null, estimate: CategoryTrend[]): CategoryTrend[] {
  if (!real) return estimate
  return real.categories.map((c) => ({ category: c.category, avgUserSg: c.per18, avgBenchmarkSg: 0, avgDeltaSg: c.per18, roundsCounted: real.rounds }))
}

/** Rounds with a category's stats before it can be called the focus area. */
export const MIN_ROUNDS_FOR_FOCUS = 3

/** Two categories this close (strokes) are a close call, not a clear weakest. */
const CLOSE_CALL_STROKES = 0.3

/** The category with the most negative average delta vs. the golfer's handicap bracket; null until one has enough rounds. */
export function weakestCategory(trends: readonly CategoryTrend[]): CategoryTrend | null {
  return trends
    .filter((t) => t.roundsCounted >= MIN_ROUNDS_FOR_FOCUS)
    .reduce<CategoryTrend | null>((worst, t) => (!worst || t.avgDeltaSg < worst.avgDeltaSg ? t : worst), null)
}

/** The weakest category, plus the next one when it is within CLOSE_CALL_STROKES of it. Empty until there is a focus. */
export function focusAreas(trends: readonly CategoryTrend[]): CategoryTrend[] {
  const weakest = weakestCategory(trends)
  if (!weakest) return []
  const next = weakestCategory(trends.filter((t) => t !== weakest))
  return next && next.avgDeltaSg - weakest.avgDeltaSg <= CLOSE_CALL_STROKES + 1e-9 ? [weakest, next] : [weakest]
}

export interface RecommendableDrill {
  id: string
  name: string
  category: SgCategory
}

export interface DrillRun {
  drill_id: string
  completed_at: string | null
}

/**
 * Drills in `category`, ordered so recommendations rotate instead of always
 * showing the same few: never-completed drills first, then the ones
 * completed longest ago, name as the tie-break.
 */
export function recommendDrills<T extends RecommendableDrill>(
  library: readonly T[],
  category: SgCategory,
  history: readonly DrillRun[],
  limit = 3
): T[] {
  const lastCompleted = new Map<string, number>()
  for (const run of history) {
    if (!run.completed_at) continue
    const t = new Date(run.completed_at).getTime()
    if (t > (lastCompleted.get(run.drill_id) ?? -Infinity)) lastCompleted.set(run.drill_id, t)
  }
  return library
    .filter((d) => d.category === category)
    .sort((a, b) => {
      const ta = lastCompleted.get(a.id) ?? -Infinity
      const tb = lastCompleted.get(b.id) ?? -Infinity
      return ta !== tb ? ta - tb : a.name.localeCompare(b.name)
    })
    .slice(0, limit)
}
