// A drill's difficulty level moves with how often the golfer succeeds at it: two sessions above 70% up a level,
// two below 50% down a level. Skipped sets are not results and count for nothing.

import type { LibraryDrill } from "@/lib/supabase/types"

/** A session above this success rate, twice in a row, moves the drill up. From the spec. */
const LEVEL_UP_ABOVE = 0.7
/** A session below this success rate, twice in a row, moves the drill down. From the spec. */
const LEVEL_DOWN_BELOW = 0.5
/** Sessions in a row that move a level. From the spec. */
const SESSIONS_TO_MOVE = 2

export interface SetResult {
  skipped: boolean
  score: number
  /** Balls or attempts: what a count_of_n or pct score is out of. */
  n?: number
  /** What a streak or strokes score is measured against (the level's streak to reach, or par putts). */
  target?: number
}

type Metric = NonNullable<LibraryDrill["metric"]>

/** Share of the set that went well, 0 to 1; null when the set cannot say (skipped, or the metric's n/target is missing). */
export function setSuccess(metric: Metric, lowerIsBetter: boolean, set: SetResult): number | null {
  if (set.skipped) return null
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  switch (metric) {
    case "count_of_n":
      return set.n && set.n > 0 ? clamp(lowerIsBetter ? (set.n - set.score) / set.n : set.score / set.n) : null
    case "pct":
      return clamp(lowerIsBetter ? 1 - set.score / 100 : set.score / 100)
    case "streak":
      return set.target && set.target > 0 ? clamp(set.score / set.target) : null
    case "strokes":
      return set.target && set.target > 0 ? clamp(set.score <= 0 ? 1 : set.target / set.score) : null
  }
}

/**
 * The level after these sessions. `sessions` are the ones played at `level`, oldest first, each a list of its sets;
 * the caller starts them afresh after a level change.
 */
export function nextLevel(args: {
  level: number
  levelCount: number
  metric: Metric
  lowerIsBetter: boolean
  sessions: readonly (readonly SetResult[])[]
}): number {
  const rates = args.sessions.flatMap((sets) => {
    const xs = sets.map((s) => setSuccess(args.metric, args.lowerIsBetter, s)).filter((x): x is number => x != null)
    return xs.length > 0 ? [xs.reduce((a, b) => a + b, 0) / xs.length] : []
  })
  const last = rates.slice(-SESSIONS_TO_MOVE)
  if (last.length < SESSIONS_TO_MOVE) return args.level
  if (last.every((x) => x > LEVEL_UP_ABOVE)) return Math.min(args.levelCount - 1, args.level + 1)
  if (last.every((x) => x < LEVEL_DOWN_BELOW)) return Math.max(0, args.level - 1)
  return args.level
}
