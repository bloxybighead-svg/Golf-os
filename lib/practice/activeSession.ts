// A practice session in progress. It lives on the device from Start until Done (so it survives the phone
// locking or the app being killed mid-set), and every change is also queued for the outbox.

import { localDate } from "@/lib/rounds/activeRound"
import type { SetResult } from "./levels"
import type { SessionBlock, SessionPlan } from "./session"

export const ACTIVE_SESSION_KEY = "golfos.activeSession.v1"

/** Tells the rest of the app that a session started, changed or ended. */
export const ACTIVE_SESSION_EVENT = "golfos:activeSession"

/** The runner's page. */
export const SESSION_PATH = "/you/practice/run"

type Metric = NonNullable<SessionBlock["metric"]>

/** One set of one drill: what the set screen shows. */
export interface RunStep {
  /** Index into the session's blocks. */
  block: number
  kind: SessionBlock["kind"]
  drillId: string
  drillName: string
  setIndex: number
  setCount: number
  label: string
  setup: string
  balls: number
  /** Club Work sets name their club. */
  club: string | null
  cue: string
  routineRule: string
  metric: Metric
  lowerIsBetter: boolean
  levelName: string | null
  /** The block's minutes shared out over its sets. */
  plannedMinutes: number
  /** What a streak or strokes score is measured against for the level check. */
  target: number | null
}

/** What the golfer entered for a set. A skipped set has no value. */
export interface RunEntry {
  skipped: boolean
  value: number | null
  /** Attempts, for a percentage metric (value is the makes). */
  attempts: number | null
  /** Club Work: where the balls went; value is the center count. */
  spread: { left: number; center: number; right: number } | null
  at: number
}

interface RunBlock {
  drillId: string
  name: string
  minutes: number
  /** When the golfer got to this block's first set. */
  startedAt: number | null
}

/** The drill's current level and the sessions already played at it, for the level check at the end. */
export interface DrillLevelState {
  index: number
  names: string[]
  history: SetResult[][]
}

type RunStatus = "running" | "completed" | "ended_early"

export interface ActiveSession {
  /** Made when the session starts; becomes practice_runs.id, so a run sent twice is still one run. */
  id: string
  userId: string
  /** Local YYYY-MM-DD the session started. */
  date: string
  location: string
  startedAt: number
  blocks: RunBlock[]
  steps: RunStep[]
  /** entries[i] belongs to steps[i]; the next set to do is steps[entries.length]. */
  entries: RunEntry[]
  status: RunStatus
  lastSavedAt: number | null
  notes: string
  /** Last time's total per drill, for the summary. */
  previous: Record<string, number | null>
  levels: Record<string, DrillLevelState>
}

/** The steps of a plan: one per set of every block, in order. */
export function newActiveSession(args: {
  id: string
  userId: string
  date: string
  location: string
  now: number
  plan: SessionPlan
  previous?: Record<string, number | null>
  levels?: Record<string, DrillLevelState>
}): ActiveSession {
  const blocks: RunBlock[] = args.plan.blocks.map((b, i) => ({ drillId: b.drillId, name: b.name, minutes: b.minutes, startedAt: i === 0 ? args.now : null }))
  const steps = args.plan.blocks.flatMap((b, block): RunStep[] =>
    b.sets.map((s, setIndex) => ({
      block,
      kind: b.kind,
      drillId: b.drillId,
      drillName: b.name,
      setIndex,
      setCount: b.sets.length,
      label: s.label,
      setup: s.setup,
      balls: s.balls,
      club: s.club ?? null,
      cue: b.cue ?? "",
      routineRule: b.routineRule ?? "",
      metric: b.metric ?? "count_of_n",
      lowerIsBetter: b.lowerIsBetter,
      levelName: b.level?.name ?? null,
      plannedMinutes: b.minutes / b.sets.length,
      target: s.balls,
    }))
  )
  return {
    id: args.id,
    userId: args.userId,
    date: args.date,
    location: args.location,
    startedAt: args.now,
    blocks,
    steps,
    entries: [],
    status: "running",
    lastSavedAt: null,
    notes: "",
    previous: args.previous ?? {},
    levels: args.levels ?? {},
  }
}

/** A session with no scored set this long after it started was abandoned. */
const EMPTY_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

const hasScores = (s: ActiveSession) => s.entries.some((e) => !e.skipped)

/** Unsaved, but over: ended early or completed and waiting for Save or Discard. */
export const isUnsaved = (s: ActiveSession) => s.status !== "running"

/** Nothing scored and started over 12 hours ago: dropped without asking. */
const isAbandoned = (s: ActiveSession, now = Date.now()) => !hasScores(s) && now - s.startedAt > EMPTY_SESSION_MAX_AGE_MS

/** Started on an earlier day with scores in it: the golfer is asked to save or discard it. */
export const isOldSession = (s: ActiveSession, now = Date.now()) => hasScores(s) && s.date < localDate(now)

/** The stored session, or null when there is none, it is not one this version understands, or it was abandoned (and is cleared). */
export function loadActiveSession(now = Date.now()): ActiveSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as ActiveSession
    if (typeof s?.id !== "string" || !Array.isArray(s.steps) || s.steps.length === 0 || !Array.isArray(s.entries)) return null
    if (isAbandoned(s, now)) {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function saveActiveSession(session: ActiveSession): void {
  try {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session))
  } catch {
    // Storage full or blocked: the session carries on in memory and the outbox still gets it.
  }
  window.dispatchEvent(new Event(ACTIVE_SESSION_EVENT))
}

export function clearActiveSession(): void {
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY)
  } catch {
    // Nothing to clear.
  }
  window.dispatchEvent(new Event(ACTIVE_SESSION_EVENT))
}

/** The practice home, where a finished or thrown-away session lands. */
export const PRACTICE_PATH = "/you/practice"
