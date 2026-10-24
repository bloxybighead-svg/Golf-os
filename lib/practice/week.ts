// The week as a checklist of minimums, not a calendar: how many sessions of each practice area to get done.
//
// Lag and short putting get at least 2 items each and the top-priority area at least 3. If the items do
// not fit the weekly minutes, the lowest-priority items go first, floors included, and what went is listed.

import { PRACTICE_AREAS, type PracticeArea } from "./weakness"

/** Minutes one checklist item takes, by area. ESTIMATE: the length of a typical drill block there. */
export const ITEM_MINUTES: Record<PracticeArea, number> = {
  lag_putting: 25,
  short_putting: 20,
  short_game: 25,
  wedges: 25,
  approach: 30,
  tee: 20,
}

/** Items a putting area gets at minimum, and the top area. From the spec. */
const PUTTING_FLOOR = 2
const TOP_FLOOR = 3
/** Items for an area with some priority that is not the top one: 2 for the three highest, else 1. ESTIMATE. */
const MAIN_ITEMS = 2

export interface WeekPrefs {
  /** Weekly practice minutes: the golfer's weekday and weekend windows. Defaults 600 and 540. */
  weekdayMinutes?: number
  weekendMinutes?: number
  /** Days with no practice. Default 1. */
  offDays?: number
}

export interface WeekItem {
  area: PracticeArea
  required: number
  done: number
  priority: number
  minutes: number
}

export interface Week {
  items: WeekItem[]
  minutes: number
  offDays: number
  /** Items that did not fit the budget, lowest priority first. */
  dropped: { area: PracticeArea; count: number }[]
}

const isPutting = (a: PracticeArea) => a === "lag_putting" || a === "short_putting"

const weekBudget = (prefs: WeekPrefs) => (prefs.weekdayMinutes ?? 600) + (prefs.weekendMinutes ?? 540)

export function buildWeek(priorities: Record<PracticeArea, number>, prefs: WeekPrefs = {}): Week {
  const budget = weekBudget(prefs)
  const ranked = [...PRACTICE_AREAS].sort((a, b) => priorities[b] - priorities[a])
  const top = ranked[0]

  const counts = {} as Record<PracticeArea, number>
  ranked.forEach((a, i) => {
    const base = priorities[a] > 0 ? (i < 3 ? MAIN_ITEMS : 1) : 0
    const floor = a === top ? TOP_FLOOR : isPutting(a) ? PUTTING_FLOOR : 0
    counts[a] = Math.max(base, floor)
  })

  const total = () => PRACTICE_AREAS.reduce((n, a) => n + counts[a] * ITEM_MINUTES[a], 0)
  const dropped = new Map<PracticeArea, number>()
  const floorOf = (a: PracticeArea) => (a === top ? TOP_FLOOR : isPutting(a) ? PUTTING_FLOOR : 0)
  // Above-floor items go first, lowest priority first; only then the floors themselves.
  for (const respectFloors of [true, false]) {
    for (const a of [...ranked].reverse()) {
      while (total() > budget && counts[a] > (respectFloors ? floorOf(a) : 0)) {
        counts[a] -= 1
        dropped.set(a, (dropped.get(a) ?? 0) + 1)
      }
    }
  }

  return {
    items: ranked.filter((a) => counts[a] > 0).map((area) => ({ area, required: counts[area], done: 0, priority: priorities[area], minutes: ITEM_MINUTES[area] })),
    minutes: total(),
    offDays: prefs.offDays ?? 1,
    dropped: [...dropped].map(([area, count]) => ({ area, count })),
  }
}

/**
 * The week again after a run or a round: what is already done stays done, the rest is re-ranked by the new priorities,
 * and the total never goes over the weekly minutes (the lowest priorities lose their not-yet-done items first).
 */
export function rebuildWeek(done: Partial<Record<PracticeArea, number>>, priorities: Record<PracticeArea, number>, prefs: WeekPrefs = {}): Week {
  const target = buildWeek(priorities, prefs)
  const wanted = (a: PracticeArea) => target.items.find((i) => i.area === a)?.required ?? 0
  const have = (a: PracticeArea) => done[a] ?? 0
  const counts = {} as Record<PracticeArea, number>
  for (const a of PRACTICE_AREAS) counts[a] = Math.max(have(a), wanted(a))

  const total = () => PRACTICE_AREAS.reduce((n, a) => n + counts[a] * ITEM_MINUTES[a], 0)
  const budget = weekBudget(prefs)
  for (const a of [...PRACTICE_AREAS].sort((x, y) => priorities[x] - priorities[y])) {
    while (total() > budget && counts[a] > have(a)) counts[a] -= 1
  }

  const ranked = [...PRACTICE_AREAS].sort((a, b) => priorities[b] - priorities[a])
  return {
    items: ranked.filter((a) => counts[a] > 0).map((area) => ({ area, required: counts[area], done: have(area), priority: priorities[area], minutes: ITEM_MINUTES[area] })),
    minutes: total(),
    offDays: prefs.offDays ?? 1,
    dropped: ranked.flatMap((area) => (wanted(area) > counts[area] ? [{ area, count: wanted(area) - counts[area] }] : [])).reverse(),
  }
}
