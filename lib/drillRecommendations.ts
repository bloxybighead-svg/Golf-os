import type { CategoryTrend, SgCategory } from "./sgBenchmarks"

export const CATEGORY_LABEL: Record<SgCategory, string> = {
  off_tee: "Off-Tee",
  approach: "Approach",
  short_game: "Short Game",
  putting: "Putting",
}

/** The order the drill picker lists them in. */
export const DRILL_CATEGORIES: readonly SgCategory[] = ["putting", "approach", "off_tee", "short_game"]

/** The category with the most negative average delta vs. the golfer's handicap bracket. */
export function weakestCategory(trends: readonly CategoryTrend[]): CategoryTrend | null {
  if (trends.length === 0) return null
  return trends.reduce((worst, t) => (t.avgDeltaSg < worst.avgDeltaSg ? t : worst))
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
