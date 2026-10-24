// What the logged runs say: items done this week, last week's row, the drill trends, and the score series
// each area's priority cut is judged on. Weeks run Monday to Sunday, in the golfer's local time.

import { areaOf, sessionsOf, type DrillRef, type FinishedRun } from "./runs"
import type { DrillScores, PracticeArea } from "./weakness"

/** A drill is trended once it has been scored this many times. From the spec. */
const MIN_SESSIONS_FOR_TREND = 3
/** A trend shows this many of the latest sessions. From the spec. */
const TREND_SESSIONS = 5
/** The primary drill's series keeps this many sessions: enough for "three in a row", no more. */
const PRIMARY_SESSIONS = 6

const pad = (n: number) => String(n).padStart(2, "0")
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The Monday on or before `d`, as a local YYYY-MM-DD. */
export function mondayOf(d: Date): string {
  const back = (d.getDay() + 6) % 7
  return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back))
}

/** The Monday a week earlier. */
export function previousMonday(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number)
  return isoDate(new Date(y, m - 1, d - 7))
}

const inWeek = (run: FinishedRun, weekStart: string) => mondayOf(new Date(run.startedAt)) === weekStart

/** Items done per area in a week: each drill scored in a run counts once, under its area. */
export function itemsDone(runs: readonly FinishedRun[], library: readonly DrillRef[], weekStart: string): Partial<Record<PracticeArea, number>> {
  const out: Partial<Record<PracticeArea, number>> = {}
  for (const run of runs.filter((r) => inWeek(r, weekStart))) {
    for (const drill of library) {
      const area = areaOf(drill)
      if (area && run.sets.some((s) => s.drillId === drill.id && !s.skipped)) out[area] = (out[area] ?? 0) + 1
    }
  }
  return out
}

/** Minutes practised in a week, from each finished run's start and end. */
export function minutesPractised(runs: readonly FinishedRun[], weekStart: string): number {
  return Math.round(
    runs.filter((r) => inWeek(r, weekStart) && r.endedAt).reduce((n, r) => n + (new Date(r.endedAt as string).getTime() - new Date(r.startedAt).getTime()) / 60_000, 0)
  )
}

export interface Improvement {
  name: string
  from: number
  to: number
}

/** The drill that got best in a week: its last score that week against the one before the week, as a share of the old score. */
export function bestImprovement(runs: readonly FinishedRun[], library: readonly DrillRef[], weekStart: string): Improvement | null {
  let best: (Improvement & { share: number }) | null = null
  for (const drill of library) {
    const sessions = sessionsOf(runs, drill)
    const inside = sessions.filter((s) => mondayOf(new Date(s.at)) === weekStart)
    const before = sessions.filter((s) => mondayOf(new Date(s.at)) < weekStart)
    if (inside.length === 0 || before.length === 0) continue
    const from = before[before.length - 1].total
    const to = inside[inside.length - 1].total
    const gain = drill.lower_is_better ? from - to : to - from
    if (from !== 0 && gain > 0 && (!best || gain / Math.abs(from) > best.share)) best = { name: drill.name, from, to, share: gain / Math.abs(from) }
  }
  return best && { name: best.name, from: best.from, to: best.to }
}

export interface DrillTrend {
  drillId: string
  name: string
  /** The latest sessions' scores, oldest first. */
  values: number[]
  sessions: number
  lowerIsBetter: boolean
  level: string | null
}

/** Every drill scored 3+ times: its last 5 scores and its level. A chart is for 5+ sessions; fewer are numbers. */
export function drillTrends(runs: readonly FinishedRun[], library: readonly DrillRef[], levels: Readonly<Record<string, number>>): DrillTrend[] {
  return library.flatMap((drill) => {
    const sessions = sessionsOf(runs, drill)
    if (sessions.length < MIN_SESSIONS_FOR_TREND) return []
    return [
      {
        drillId: drill.id,
        name: drill.name,
        values: sessions.slice(-TREND_SESSIONS).map((s) => s.total),
        sessions: sessions.length,
        lowerIsBetter: drill.lower_is_better,
        level: drill.levels[levels[drill.id] ?? 0]?.name ?? null,
      },
    ]
  })
}

/** Per area, the drill scored most often (the latest on a tie) and its recent scores: what the "improved three sessions in a row" cut reads. */
export function primaryDrillScores(runs: readonly FinishedRun[], library: readonly DrillRef[]): Partial<Record<PracticeArea, DrillScores>> {
  const out: Partial<Record<PracticeArea, DrillScores & { count: number; last: string }>> = {}
  for (const drill of library) {
    const area = areaOf(drill)
    const sessions = sessionsOf(runs, drill)
    if (!area || sessions.length === 0) continue
    const last = sessions[sessions.length - 1].at
    const current = out[area]
    if (!current || sessions.length > current.count || (sessions.length === current.count && last > current.last)) {
      out[area] = { scores: sessions.slice(-PRIMARY_SESSIONS).map((s) => s.total), lowerIsBetter: drill.lower_is_better, count: sessions.length, last }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([area, v]) => [area, { scores: v.scores, lowerIsBetter: v.lowerIsBetter }])) as Partial<Record<PracticeArea, DrillScores>>
}

/** Average Tiger 5 total per round in a week against the average of all the rounds given (the last 10). Null where there are none. */
export function tiger5Averages(rounds: readonly { date: string; total: number }[], weekStart: string): { week: number | null; recent: number | null } {
  const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    week: mean(rounds.filter((r) => mondayOf(new Date(`${r.date}T12:00:00`)) === weekStart).map((r) => r.total)),
    recent: mean(rounds.map((r) => r.total)),
  }
}
