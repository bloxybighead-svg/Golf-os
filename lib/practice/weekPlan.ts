// The week's plan, kept across visits: the week's items and top area are remembered so that Monday can show last
// week and say why the top priority moved. What is done is never stored; it is counted from the runs every time,
// so the checklist is rebuilt from the latest runs and rounds whenever the page is read.

import { bestImprovement, itemsDone, mondayOf, minutesPractised, previousMonday, tiger5Averages, type Improvement } from "./progress"
import type { DrillRef, FinishedRun } from "./runs"
import { AREA_LABEL, PRACTICE_AREAS, type AreaWeakness, type PracticeArea } from "./weakness"
import { rebuildWeek, type Week, type WeekPrefs } from "./week"

export const WEEK_PLAN_KEY = "golfos.practiceWeek.v1"

export interface StoredWeek {
  /** The Monday, local YYYY-MM-DD. */
  weekStart: string
  /** The items as last planned (what "planned" means for last week). */
  items: { area: PracticeArea; required: number }[]
  topArea: PracticeArea | null
}

export interface StoredPlan {
  current: StoredWeek
  last: StoredWeek | null
}

export interface WeekView {
  week: Week
  /** Last week's plan, to show on Mondays. */
  last: StoredWeek | null
  /** One line saying why the top priority is not last week's, or null. */
  topChange: string | null
  /** What to keep for next time. */
  next: StoredPlan
}

/** The area with the highest priority; null when none has any. */
function topArea(scores: readonly AreaWeakness[]): PracticeArea | null {
  const top = [...scores].sort((a, b) => b.priority - a.priority)[0]
  return top && top.priority > 0 ? top.area : null
}

/** "Wedges moved up: 0.9 strokes/round lost vs scratch, ...": the engine's own explanation for the new top area. */
function whyMovedUp(scores: readonly AreaWeakness[], area: PracticeArea): string {
  const w = scores.find((s) => s.area === area) as AreaWeakness
  return `${AREA_LABEL[area]} moved up: ${w.explanation.replace(`${AREA_LABEL[area]}: `, "")}`
}

export function planWeek(args: {
  stored: StoredPlan | null
  now: Date
  scores: readonly AreaWeakness[]
  done: Partial<Record<PracticeArea, number>>
  prefs?: WeekPrefs
}): WeekView {
  const weekStart = mondayOf(args.now)
  const priorities = Object.fromEntries(PRACTICE_AREAS.map((a) => [a, args.scores.find((s) => s.area === a)?.priority ?? 0])) as Record<PracticeArea, number>
  const week = rebuildWeek(args.done, priorities, args.prefs)
  const top = topArea(args.scores)

  // The stored week from the Monday before becomes "last week"; anything older is no use.
  const candidate = args.stored && args.stored.current.weekStart !== weekStart ? args.stored.current : (args.stored?.last ?? null)
  const last = candidate?.weekStart === previousMonday(weekStart) ? candidate : null
  const current: StoredWeek = { weekStart, items: week.items.map((i) => ({ area: i.area, required: i.required })), topArea: top }
  return {
    week,
    last,
    topChange: last?.topArea && top && last.topArea !== top ? whyMovedUp(args.scores, top) : null,
    next: { current, last },
  }
}

export interface LastWeekSummary {
  /** Items done against items planned; an area done more often than planned counts as planned. */
  done: number
  planned: number
  minutes: number
  best: Improvement | null
  /** Tiger 5 per round in that week against the recent rounds given. */
  tiger5: { week: number | null; recent: number | null }
}

export function lastWeekSummary(
  last: StoredWeek,
  runs: readonly FinishedRun[],
  library: readonly DrillRef[],
  tiger5Rounds: readonly { date: string; total: number }[]
): LastWeekSummary {
  const done = itemsDone(runs, library, last.weekStart)
  return {
    done: last.items.reduce((n, i) => n + Math.min(i.required, done[i.area] ?? 0), 0),
    planned: last.items.reduce((n, i) => n + i.required, 0),
    minutes: minutesPractised(runs, last.weekStart),
    best: bestImprovement(runs, library, last.weekStart),
    tiger5: tiger5Averages(tiger5Rounds, last.weekStart),
  }
}
