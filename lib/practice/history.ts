// Drill history: one row per drill per finished run, newest first.

import type { LibraryDrill, SgCategory } from "@/lib/supabase/types"
import type { DrillRef, FinishedRun } from "./runs"
import { drillTotal } from "./scores"

export const FREE_PRACTICE = "Free practice"

export interface HistoryRow {
  key: string
  name: string
  category: SgCategory | null
  at: string
  /** The drill's score for the run; null when it was logged without one or the run did not score it. */
  score: number | null
  /** Played in the runner rather than logged by hand. */
  session: boolean
}

type HistoryDrill = DrillRef & Pick<LibraryDrill, "category">

export function historyRows(runs: readonly FinishedRun[], library: readonly HistoryDrill[]): HistoryRow[] {
  return [...runs]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((run): HistoryRow[] => {
      const session = run.source !== "logged"
      const played = library.flatMap((drill) => {
        const sets = run.sets.filter((s) => s.drillId === drill.id && !s.skipped)
        return sets.length > 0 ? [{ drill, sets }] : []
      })
      if (played.length === 0) {
        return session ? [] : [{ key: run.id, name: FREE_PRACTICE, category: null, at: run.startedAt, score: null, session }]
      }
      return played.map(({ drill, sets }) => ({
        key: `${run.id}:${drill.id}`,
        name: drill.name,
        category: drill.category,
        at: run.startedAt,
        score: drillTotal(drill.metric ?? "count_of_n", sets),
        session,
      }))
    })
}
