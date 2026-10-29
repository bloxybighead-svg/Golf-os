import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ACTIVE_SESSION_KEY, isOldSession, loadActiveSession, newActiveSession } from "./activeSession"
import type { SessionPlan } from "./session"

const plan = {
  blocks: [{ drillId: "d", name: "Drill", kind: "drill", category: "lag_putting", startsAt: new Date(), minutes: 10, balls: 5, sets: [{ label: "s", setup: "x", balls: 5 }], routineRule: null, cue: "c", metric: "count_of_n", lowerIsBetter: false, level: null }],
} as unknown as SessionPlan
const HOUR = 3_600_000
const started = new Date(2026, 9, 21, 8).getTime()
const empty = () => newActiveSession({ id: "s1", userId: "u", date: "2026-10-21", location: "range", now: started, plan })
const scored = () => ({ ...empty(), entries: [{ skipped: false, value: 3, attempts: null, spread: null, at: started }] })

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as { window?: unknown }).window = {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  }
})
afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe("a session left on the device", () => {
  it("with nothing scored for 13 hours is cleared on load", () => {
    store.set(ACTIVE_SESSION_KEY, JSON.stringify(empty()))
    expect(loadActiveSession(started + 13 * HOUR)).toBeNull()
    expect(store.has(ACTIVE_SESSION_KEY)).toBe(false)
  })

  it("with nothing scored for 11 hours is kept", () => {
    store.set(ACTIVE_SESSION_KEY, JSON.stringify(empty()))
    expect(loadActiveSession(started + 11 * HOUR)?.id).toBe("s1")
  })

  it("with scores from an earlier day is kept and asked about", () => {
    store.set(ACTIVE_SESSION_KEY, JSON.stringify(scored()))
    const next = new Date(2026, 9, 22, 9).getTime()
    expect(loadActiveSession(next)?.id).toBe("s1")
    expect(isOldSession(scored(), next)).toBe(true)
    expect(isOldSession(scored(), started + HOUR)).toBe(false)
  })
})
