// The session runner's rules, with no screen in them: save a set, skip one, undo, end early, jump to the
// close-out, the block timer, the cutoff notice, the summary, and the outbox payload.

import type { PracticeRunPayload } from "@/lib/offline/jobs"
import { nextLevel, type SetResult } from "./levels"
import { drillTotal } from "./scores"
import type { ActiveSession, RunEntry, RunStep } from "./activeSession"

/** The last save can be undone for this long. */
export const UNDO_MS = 5_000
/** A block this far past its plan turns the timer to the warning color. From the spec: 3+ min over. */
const OVER_MIN = 3
/** Logging must end by 8:45 pm (the device cutoff); the notice shows once the session would still be going at 8:40. */
const CUTOFF = { hour: 20, minute: 45 }
const NOTICE_AT = { hour: 20, minute: 40 }

const at = (ms: number, t: { hour: number; minute: number }) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.hour, t.minute).getTime()
}

export function currentStep(s: ActiveSession): RunStep | null {
  return s.status === "running" ? (s.steps[s.entries.length] ?? null) : null
}

/** Sets done over sets in the session. */
export const progress = (s: ActiveSession) => ({ done: s.entries.length, total: s.steps.length })

/** The session with `entries` and the clock-in time of whichever block comes next. */
function withEntries(s: ActiveSession, entries: RunEntry[], now: number): ActiveSession {
  const next = s.steps[entries.length]
  const blocks = s.blocks.map((b, i) => (next && i === next.block && b.startedAt == null ? { ...b, startedAt: now } : b))
  return { ...s, entries, blocks, status: next ? "running" : "completed" }
}

export function recordEntry(s: ActiveSession, input: { value: number; attempts?: number; spread?: RunEntry["spread"] }, now: number): ActiveSession {
  if (!currentStep(s)) return s
  const entry: RunEntry = { skipped: false, value: input.value, attempts: input.attempts ?? null, spread: input.spread ?? null, at: now }
  return { ...withEntries(s, [...s.entries, entry], now), lastSavedAt: now }
}

/** A skipped set is saved as skipped with no value, never as 0. */
export function skipSet(s: ActiveSession, now: number): ActiveSession {
  if (!currentStep(s)) return s
  const entry: RunEntry = { skipped: true, value: null, attempts: null, spread: null, at: now }
  return { ...withEntries(s, [...s.entries, entry], now), lastSavedAt: now }
}

/** Takes back the last save, within UNDO_MS of it. */
export function undoLast(s: ActiveSession, now: number): ActiveSession {
  if (s.status === "ended_early" || s.entries.length === 0 || s.lastSavedAt == null || now - s.lastSavedAt > UNDO_MS) return s
  const entries = s.entries.slice(0, -1)
  const back = s.steps[entries.length]
  const after = s.steps[entries.length + 1]
  // Leaving the first set of a block undoes the block's clock-in too.
  const blocks = s.blocks.map((b, i) => (after && after.block !== back.block && i === after.block ? { ...b, startedAt: null } : b))
  return { ...s, entries, blocks, status: "running", lastSavedAt: null }
}

export const endEarly = (s: ActiveSession): ActiveSession => (s.status === "running" ? { ...s, status: "ended_early", lastSavedAt: null } : s)

/** Skips every set before the close-out (saved as skipped) and lands on its first set. */
export function jumpToCloseout(s: ActiveSession, now: number): ActiveSession {
  const target = s.steps.findIndex((st, i) => i >= s.entries.length && st.kind === "closeout")
  if (!currentStep(s) || target < 0) return s
  const skipped: RunEntry[] = s.steps.slice(s.entries.length, target).map(() => ({ skipped: true, value: null, attempts: null, spread: null, at: now }))
  return { ...withEntries(s, [...s.entries, ...skipped], now), lastSavedAt: null }
}

interface CloseoutState {
  /** Makes in a row so far. */
  made: number
  /** Putts taken, which is the score. */
  putts: number
}

/** One close-out putt: a make adds to the streak, a miss restarts it at 0 (the pass-to-leave rule). `passed` once the streak is reached. */
export function closeoutPutt(state: CloseoutState, made: boolean, streak: number): { state: CloseoutState; passed: boolean } {
  const next = { made: made ? state.made + 1 : 0, putts: state.putts + 1 }
  return { state: next, passed: next.made >= streak }
}

/** Minutes into the current block, its plan, and whether it has run 3+ min over. */
export function blockTimer(s: ActiveSession, now: number): { elapsedMs: number; plannedMin: number; over: boolean } | null {
  const step = currentStep(s)
  if (!step) return null
  const block = s.blocks[step.block]
  const elapsedMs = Math.max(0, now - (block.startedAt ?? now))
  return { elapsedMs, plannedMin: block.minutes, over: elapsedMs >= (block.minutes + OVER_MIN) * 60_000 }
}

/**
 * Set when the sets still to do would run past 8:40 pm and a close-out is still ahead: the minutes left
 * to the 8:45 cutoff, for "N min to cutoff · jump to close-out".
 */
export function cutoffNotice(s: ActiveSession, now: number): { minutes: number } | null {
  const step = currentStep(s)
  if (!step || step.kind === "closeout" || !s.steps.some((st, i) => i > s.entries.length && st.kind === "closeout")) return null
  const remaining = s.steps.slice(s.entries.length).reduce((n, st) => n + st.plannedMinutes, 0)
  if (now + remaining * 60_000 <= at(now, NOTICE_AT)) return null
  return { minutes: Math.max(0, Math.floor((at(now, CUTOFF) - now) / 60_000)) }
}

export interface DrillSummary {
  drillId: string
  name: string
  skipped: boolean
  /** "6 of 40", "5 in a row", "9 putts", "70%"; "skipped" when every set was. */
  result: string
  /** Last time's total, or null. */
  last: number | null
  /** The drill's level after this session, and where it came from when it moved. */
  level: { from: string | null; to: string | null; moved: "up" | "down" | null }
  newLevelIndex: number | null
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function resultText(steps: RunStep[], entries: RunEntry[]): string {
  const done = entries.map((e, i) => ({ e, st: steps[i] })).filter((x) => !x.e.skipped && x.e.value != null)
  const total = drillTotal(steps[0]?.metric ?? "count_of_n", done.map((x) => x.e))
  if (total == null) return "skipped"
  switch (done[0].st.metric) {
    case "count_of_n":
      return `${total} of ${sum(done.map((x) => x.st.balls))}`
    case "streak":
      return `${total} in a row`
    case "strokes":
      return `${total} putts`
    case "pct":
      return `${total}%`
  }
}

/** What the golfer did with each drill this session, against last time, and the level each ends on. */
export function summarize(s: ActiveSession): DrillSummary[] {
  const drillIds = [...new Set(s.steps.map((st) => st.drillId))]
  return drillIds.map((drillId) => {
    const indexes = s.steps.flatMap((st, i) => (st.drillId === drillId && i < s.entries.length ? [i] : []))
    const steps = indexes.map((i) => s.steps[i])
    const entries = indexes.map((i) => s.entries[i])
    const first = s.steps.find((st) => st.drillId === drillId) as RunStep
    const result = resultText(steps, entries)
    const state = s.levels[drillId]

    let newIndex: number | null = state?.index ?? null
    if (state && result !== "skipped") {
      const sets: SetResult[] = entries.map((e, i) => ({
        skipped: e.skipped,
        score: first.metric === "pct" ? (e.attempts ? (100 * (e.value ?? 0)) / e.attempts : 0) : (e.value ?? 0),
        n: steps[i].balls,
        target: steps[i].target ?? undefined,
      }))
      newIndex = nextLevel({ level: state.index, levelCount: state.names.length, metric: first.metric, lowerIsBetter: first.lowerIsBetter, sessions: [...state.history, sets] })
    }
    const moved = state && newIndex != null && newIndex !== state.index ? (newIndex > state.index ? "up" : "down") : null
    return {
      drillId,
      name: first.drillName,
      skipped: result === "skipped",
      result,
      last: s.previous[drillId] ?? null,
      level: { from: state ? (state.names[state.index] ?? null) : null, to: state && newIndex != null ? (state.names[newIndex] ?? null) : null, moved },
      newLevelIndex: state ? newIndex : null,
    }
  })
}

/** Everything the outbox sends for this run; level changes go with it once the run is done. */
export function toRunPayload(s: ActiveSession, done: { at: number } | null): PracticeRunPayload {
  const iso = (ms: number) => new Date(ms).toISOString()
  return {
    userId: s.userId,
    run: {
      id: s.id,
      date: s.date,
      location: s.location,
      startedAt: iso(s.startedAt),
      endedAt: done ? iso(done.at) : null,
      status: s.status,
      notes: s.notes.trim() || null,
      source: "session",
    },
    sets: s.entries.map((e, i) => ({
      stepIndex: i,
      blockIndex: s.steps[i].block,
      drillId: s.steps[i].drillId,
      label: s.steps[i].label,
      club: s.steps[i].club,
      skipped: e.skipped,
      value: e.value,
      attempts: e.attempts,
      spread: e.spread,
      at: iso(e.at),
    })),
    levelChanges: done
      ? summarize(s).flatMap((d) => (d.level.moved && d.newLevelIndex != null ? [{ drillId: d.drillId, level: d.newLevelIndex }] : []))
      : [],
  }
}
