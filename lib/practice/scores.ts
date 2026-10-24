// A drill's score for one session, from the sets saved: the one number its trend and its "last time" are made of.

import type { LibraryDrill } from "@/lib/supabase/types"

type Metric = NonNullable<LibraryDrill["metric"]>

interface ScoredSet {
  value: number | null
  /** Attempts, for a percentage metric (value is the makes). */
  attempts: number | null
}

/** Count and strokes add up, a streak is the best one, a percentage is makes over attempts. Null when every set was skipped. */
export function drillTotal(metric: Metric, sets: readonly ScoredSet[]): number | null {
  const values = sets.flatMap((s) => (s.value == null ? [] : [s.value]))
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  switch (metric) {
    case "count_of_n":
    case "strokes":
      return sum
    case "streak":
      return Math.max(...values)
    case "pct": {
      const attempts = sets.reduce((a, s) => a + (s.value == null ? 0 : (s.attempts ?? 0)), 0)
      return attempts > 0 ? Math.round((100 * sum) / attempts) : 0
    }
  }
}
