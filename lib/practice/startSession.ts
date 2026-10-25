// Starting a session: the three answers, the next round remembered on the device, and the steps from the answers
// to a running session (buildSession, then newActiveSession).

import type { LibraryDrill } from "@/lib/supabase/types"
import { newRoundId } from "@/lib/rounds/activeRound"
import { setRoundPaused } from "@/lib/rounds/roundMode"
import type { DrillLevelState, ActiveSession } from "./activeSession"
import { SESSION_PATH, newActiveSession, saveActiveSession } from "./activeSession"
import type { SetResult } from "./levels"
import { sessionsOf, type DrillRef, type FinishedRun } from "./runs"
import { buildSession, type DrillLocation, type Energy, type HistorySet, type NextRound, type SessionPlan } from "./session"
import { PRACTICE_AREAS, type PracticeArea } from "./weakness"
import type { WeekItem } from "./week"

export const ANSWERS_KEY = "golfos.practiceAnswers.v1"
export const NEXT_ROUND_KEY = "golfos.nextRound.v1"

export interface Answers {
  minutes: number
  locations: DrillLocation[]
  energy: Energy
  /** Up to two areas for the main blocks; empty is Auto. */
  focus: PracticeArea[]
}

export const DEFAULT_ANSWERS: Answers = { minutes: 60, locations: ["putting_green"], energy: "ok", focus: [] }

export const MAX_FOCUS = 2

/** The focus chips: every area the week is made of. */
export const FOCUS_CHOICES = PRACTICE_AREAS

export const MINUTE_CHOICES = [30, 60, 90, 120] as const

export const LOCATION_CHOICES: { value: DrillLocation; label: string }[] = [
  { value: "home_net", label: "Home net" },
  { value: "short_game_area", label: "Short-game area" },
  { value: "putting_green", label: "Putting green" },
  { value: "range", label: "Range" },
  { value: "course", label: "Course" },
  { value: "simulator", label: "Simulator" },
]

/** The next round as kept on the device: a local YYYY-MM-DD, and the two answers about it. */
export interface StoredNextRound {
  date: string
  competitive: boolean
  courseKnown: boolean
}

const pad = (n: number) => String(n).padStart(2, "0")
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The next round if its date has not passed; one that has is forgotten. */
export function liveNextRound(stored: StoredNextRound | null, now: Date): StoredNextRound | null {
  return stored && stored.date >= localDate(now) ? stored : null
}

function toNextRound(r: StoredNextRound | null): NextRound | null {
  if (!r) return null
  const [y, m, d] = r.date.split("-").map(Number)
  return { date: new Date(y, m - 1, d, 12), competitive: r.competitive, courseKnown: r.courseKnown }
}

/** "Next round: Sat, competitive, known course" or "Next round: not set". */
export function nextRoundLabel(r: StoredNextRound | null): string {
  if (!r) return "Next round: not set"
  const [y, m, d] = r.date.split("-").map(Number)
  const day = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" })
  return `Next round: ${day}, ${r.competitive ? "competitive" : "casual"}, ${r.courseKnown ? "known course" : "new course"}`
}

/** Where a focus can be done: the places that have an active drill for the area. */
export function focusPlaces(area: PracticeArea, library: readonly LibraryDrill[]): DrillLocation[] {
  const places = new Set(library.filter((d) => d.status === "active" && d.practice_category === area).flatMap((d) => d.locations))
  return LOCATION_CHOICES.map((l) => l.value).filter((l) => places.has(l))
}

/** The minutes choice that fits under the cap: the one remembered, or the most the cap allows. */
export function fitMinutes(minutes: number, cap: number): number {
  return Math.max(0, Math.min(minutes, cap))
}

function historyFromRuns(runs: readonly FinishedRun[]): HistorySet[] {
  return runs.flatMap((r) => r.sets.map((s) => ({ drillId: s.drillId, at: new Date(r.startedAt), skipped: s.skipped })))
}

export function buildPlan(args: {
  week: readonly WeekItem[]
  now: Date
  answers: Answers
  nextRound: StoredNextRound | null
  runs: readonly FinishedRun[]
  library: readonly LibraryDrill[]
  levels: Readonly<Record<string, number>>
}): SessionPlan {
  return buildSession({
    week: args.week,
    now: args.now,
    minutes: args.answers.minutes,
    locations: args.answers.locations,
    energy: args.answers.energy,
    focus: args.answers.focus,
    nextRound: toNextRound(args.nextRound),
    history: historyFromRuns(args.runs),
    library: args.library,
    levels: args.levels,
  })
}

/** The sessions of a drill played at its current level, as the level check reads them: set results, oldest first. */
function levelHistory(runs: readonly FinishedRun[], drill: DrillRef, since: string | undefined): SetResult[][] {
  return runs
    .filter((r) => !since || r.startedAt > since)
    .flatMap((r) => {
      const sets = r.sets.filter((s) => s.drillId === drill.id)
      return sets.length > 0
        ? [sets.map((s, k) => ({ skipped: s.skipped, score: s.value ?? 0, n: drill.sets[k]?.balls, target: drill.sets[k]?.balls }))]
        : []
    })
}

/** The running session for a plan: last time's scores and each drill's level and recent history from the runs. */
export function startFromPlan(args: {
  plan: SessionPlan
  now: Date
  locations: readonly DrillLocation[]
  userId: string
  runs: readonly FinishedRun[]
  library: readonly DrillRef[]
  levels: Readonly<Record<string, number>>
  levelSince: Readonly<Record<string, string>>
}): ActiveSession {
  const previous: Record<string, number | null> = {}
  const levelState: Record<string, DrillLevelState> = {}
  for (const b of args.plan.blocks) {
    const drill = args.library.find((d) => d.id === b.drillId)
    if (!drill) continue
    const sessions = sessionsOf(args.runs, drill)
    previous[drill.id] = sessions.length > 0 ? sessions[sessions.length - 1].total : null
    levelState[drill.id] = { index: args.levels[drill.id] ?? 0, names: drill.levels.map((l) => l.name), history: levelHistory(args.runs, drill, args.levelSince[drill.id]) }
  }
  return newActiveSession({
    id: newRoundId(),
    userId: args.userId,
    date: localDate(args.now),
    location: args.locations.join(","),
    now: args.now.getTime(),
    plan: args.plan,
    previous,
    levels: levelState,
  })
}

/** Saves the session on the device, leaves any pause, and opens the runner. */
export function beginSession(session: ActiveSession, router: { push: (href: string) => void }): void {
  saveActiveSession(session)
  setRoundPaused(false)
  router.push(SESSION_PATH)
}
