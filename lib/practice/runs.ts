// Finished practice runs as the week card and the drill trends read them, from the database or from the outbox.

import type { PracticeRunPayload } from "@/lib/offline/jobs"
import type { LibraryDrill } from "@/lib/supabase/types"
import { drillTotal } from "./scores"
import { PRACTICE_AREAS, type PracticeArea } from "./weakness"

interface RunSet {
  drillId: string
  skipped: boolean
  value: number | null
  attempts: number | null
}

export interface FinishedRun {
  id: string
  startedAt: string
  endedAt: string | null
  sets: RunSet[]
}

/** What a drill needs to be read by: its score, its direction, its area and its level names. */
export type DrillRef = Pick<LibraryDrill, "id" | "name" | "metric" | "lower_is_better" | "practice_category" | "levels" | "sets">

/** A run waiting in the outbox, once it is done. A run still going is not finished. */
export function runFromPayload(p: PracticeRunPayload): FinishedRun | null {
  if (p.run.status === "running") return null
  return {
    id: p.run.id,
    startedAt: p.run.startedAt,
    endedAt: p.run.endedAt,
    sets: p.sets.map((s) => ({ drillId: s.drillId, skipped: s.skipped, value: s.value, attempts: s.attempts })),
  }
}

/** Saved runs and the ones still in the outbox, each run once (the saved copy wins), oldest first. */
export function mergeRuns(saved: readonly FinishedRun[], pending: readonly FinishedRun[]): FinishedRun[] {
  const known = new Set(saved.map((r) => r.id))
  return [...saved, ...pending.filter((r) => !known.has(r.id))].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

export const areaOf = (d: DrillRef): PracticeArea | null => PRACTICE_AREAS.find((a) => a === d.practice_category) ?? null

interface Session {
  at: string
  total: number
}

/** One drill's score in each run it was scored in, oldest first. A run where every set was skipped is not a session. */
export function sessionsOf(runs: readonly FinishedRun[], drill: DrillRef): Session[] {
  return runs.flatMap((r) => {
    const total = drillTotal(drill.metric ?? "count_of_n", r.sets.filter((s) => s.drillId === drill.id && !s.skipped))
    return total == null ? [] : [{ at: r.startedAt, total }]
  })
}
