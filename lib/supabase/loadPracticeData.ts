import type { createClient } from "@/lib/supabase/server"
import type { DrillRef, FinishedRun } from "@/lib/practice/runs"

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Finished runs read this far back: enough for last week, a trend of five sessions and a week before for "improvement". */
const RUNS_LIMIT = 150

interface RunRow {
  id: string
  started_at: string
  ended_at: string | null
}
interface SetRow {
  run_id: string
  drill_id: string
  skipped: boolean
  value: number | string | null
  attempts: number | null
}

/** The golfer's finished practice runs, their drills (every status: a closed drill still has a history) and each drill's level. */
export async function loadPracticeData(supabase: Supabase): Promise<{ runs: FinishedRun[]; library: DrillRef[]; levels: Record<string, number>; levelSince: Record<string, string> }> {
  const [runsRes, libraryRes, levelsRes] = await Promise.all([
    supabase.from("practice_runs").select("id, started_at, ended_at").neq("status", "running").order("started_at", { ascending: false }).limit(RUNS_LIMIT),
    supabase.from("drill_library").select("id, name, metric, lower_is_better, practice_category, levels, sets"),
    supabase.from("drill_levels").select("drill_id, level, updated_at"),
  ])
  const runRows = (runsRes.data ?? []) as RunRow[]
  const levelRows = (levelsRes.data ?? []) as { drill_id: string; level: number; updated_at: string }[]
  const setRows =
    runRows.length > 0
      ? (((await supabase.from("practice_run_sets").select("run_id, drill_id, skipped, value, attempts").in("run_id", runRows.map((r) => r.id)).order("step_index")).data ?? []) as SetRow[])
      : []
  return {
    runs: runRows
      .map((r) => ({
        id: r.id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        sets: setRows.filter((s) => s.run_id === r.id).map((s) => ({ drillId: s.drill_id, skipped: s.skipped, value: s.value == null ? null : Number(s.value), attempts: s.attempts })),
      }))
      .reverse(),
    library: (libraryRes.data ?? []) as DrillRef[],
    levels: Object.fromEntries(levelRows.map((l) => [l.drill_id, l.level])),
    /** When each drill's level last changed: only sessions after it count toward the next change. */
    levelSince: Object.fromEntries(levelRows.map((l) => [l.drill_id, l.updated_at])),
  }
}
