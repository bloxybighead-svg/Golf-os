import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { LibraryDrill } from "@/lib/supabase/types"
import { ACTIVE_SESSION_KEY, SESSION_PATH, loadActiveSession, type ActiveSession } from "./activeSession"
import { buildSession } from "./session"
import { beginSession, buildPlan, fitMinutes, liveNextRound, nextRoundLabel, startFromPlan } from "./startSession"
import { typicalScores } from "./weakness"
import { planWeek } from "./weekPlan"
import type { FinishedRun } from "./runs"

vi.mock("./session", async (original) => {
  const actual = await original<typeof import("./session")>()
  return { ...actual, buildSession: vi.fn(actual.buildSession) }
})

// The real library, as seeded by the v2 migration.
const migration = readFileSync(join(__dirname, "../../supabase/migrations/20261024000000_drill_library_v2.sql"), "utf8")
const seed = JSON.parse(migration.match(/\$seed\$([\s\S]*?)\$seed\$/)![1]) as Omit<LibraryDrill, "id">[]
const library: LibraryDrill[] = seed.map((d) => ({ ...d, id: d.name }))
const active = library.filter((d) => d.status === "active")

const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m)
const answers = { minutes: 60, location: "putting_green" as const, energy: "ok" as const }
const plan = (o: Partial<Parameters<typeof buildPlan>[0]> = {}) =>
  buildPlan({ week: [], now: at(10), answers, nextRound: null, runs: [], library: active, levels: {}, ...o })

describe("buildPlan", () => {
  it("passes the answers to buildSession", () => {
    const week = planWeek({ stored: null, now: at(10), scores: typicalScores(), done: {} }).week.items
    plan({ week, answers: { minutes: 90, location: "range", energy: "pain" }, nextRound: { date: "2026-10-23", competitive: true, courseKnown: false } })
    expect(buildSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        minutes: 90,
        location: "range",
        energy: "pain",
        week,
        nextRound: expect.objectContaining({ competitive: true, courseKnown: false }),
      })
    )
  })

  it("caps a 7:30 pm start at the cutoff", () => {
    const p = plan({ now: at(19, 30), answers: { ...answers, minutes: 120 } })
    expect(p.practiceMinutes).toBeLessThanOrEqual(70)
    expect(p.notes.join(" ")).toContain("8:45")
  })

  it("gives a golfer with no rounds a week and a session", () => {
    const view = planWeek({ stored: null, now: at(10), scores: typicalScores(), done: {} })
    expect(view.week.items.length).toBeGreaterThan(0)
    expect(view.week.items[0].area).toBe("approach")
    const p = plan({ week: view.week.items, answers: { ...answers, location: "range" } })
    expect(p.blocks.length).toBeGreaterThan(0)
  })

  it("keeps putting to at least a quarter of a putting-green session", () => {
    const view = planWeek({ stored: null, now: at(10), scores: typicalScores(), done: {} })
    const p = plan({ week: view.week.items })
    const putting = p.blocks.filter((b) => ["lag_putting", "short_putting", "warmup", "closeout"].includes(b.category)).reduce((n, b) => n + b.minutes, 0)
    expect(putting / p.practiceMinutes).toBeGreaterThanOrEqual(0.25)
  })

  it("an off day has a note and no blocks", () => {
    const history: FinishedRun[] = [1, 2, 3, 4, 5, 6].map((back) => ({ id: `r${back}`, startedAt: new Date(2026, 9, 21 - back, 12).toISOString(), endedAt: null, sets: [{ drillId: "Pelz Lag Ladder", skipped: false, value: 3, attempts: null }] }))
    const p = plan({ runs: history })
    expect(p.off).toBe(true)
    expect(p.blocks).toEqual([])
    expect(p.notes.length).toBeGreaterThan(0)
  })
})

describe("starting", () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    ;(globalThis as { window?: unknown }).window = {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
      dispatchEvent: () => true,
    }
  })
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
  })

  const start = (): ActiveSession => {
    const p = plan({ week: planWeek({ stored: null, now: at(10), scores: typicalScores(), done: {} }).week.items })
    return startFromPlan({ plan: p, now: at(10), location: "putting_green", userId: "u1", runs: [], library, levels: { "Pelz Lag Ladder": 1 }, levelSince: {} })
  }

  it("makes a session with a new id, today's date, and each drill's level", () => {
    const s = start()
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(s).toMatchObject({ userId: "u1", date: "2026-10-21", location: "putting_green", status: "running" })
    expect(s.steps.length).toBeGreaterThan(0)
    expect(s.levels["Pelz Lag Ladder"]?.index ?? 1).toBe(1)
    expect(Object.values(s.levels).every((l) => l.names.length > 0)).toBe(true)
  })

  it("brings last time's score and only the sessions since the last level change", () => {
    const first: FinishedRun = { id: "a", startedAt: "2026-10-01T10:00:00.000Z", endedAt: null, sets: [{ drillId: "Pelz Lag Ladder", skipped: false, value: 9, attempts: null }] }
    const second: FinishedRun = { id: "b", startedAt: "2026-10-10T10:00:00.000Z", endedAt: null, sets: [{ drillId: "Pelz Lag Ladder", skipped: false, value: 6, attempts: null }] }
    const p = plan({ week: planWeek({ stored: null, now: at(10), scores: typicalScores(), done: {} }).week.items, runs: [first, second], nextRound: null })
    const s = startFromPlan({ plan: p, now: at(10), location: "putting_green", userId: "u1", runs: [first, second], library, levels: {}, levelSince: { "Pelz Lag Ladder": "2026-10-05T00:00:00.000Z" } })
    if (s.levels["Pelz Lag Ladder"]) {
      expect(s.previous["Pelz Lag Ladder"]).toBe(6)
      expect(s.levels["Pelz Lag Ladder"].history).toHaveLength(1)
    }
  })

  it("beginSession saves it on the device and routes to the runner", () => {
    const s = start()
    const router = { push: vi.fn() }
    beginSession(s, router)
    expect(loadActiveSession()?.id).toBe(s.id)
    expect(store.has(ACTIVE_SESSION_KEY)).toBe(true)
    expect(router.push).toHaveBeenCalledWith(SESSION_PATH)
  })
})

describe("answers", () => {
  it("fits remembered minutes under the cutoff cap", () => {
    expect(fitMinutes(120, 70)).toBe(70)
    expect(fitMinutes(30, 70)).toBe(30)
    expect(fitMinutes(60, 0)).toBe(0)
  })

  it("forgets a next round whose date has passed", () => {
    const r = { date: "2026-10-20", competitive: true, courseKnown: true }
    expect(liveNextRound(r, at(10))).toBeNull()
    expect(liveNextRound({ ...r, date: "2026-10-21" }, at(10))).toEqual({ ...r, date: "2026-10-21" })
    expect(liveNextRound(null, at(10))).toBeNull()
  })

  it("labels the next round", () => {
    expect(nextRoundLabel(null)).toBe("Next round: not set")
    expect(nextRoundLabel({ date: "2026-10-24", competitive: true, courseKnown: true })).toBe("Next round: Sat, competitive, known course")
    expect(nextRoundLabel({ date: "2026-10-24", competitive: false, courseKnown: false })).toBe("Next round: Sat, casual, new course")
  })
})
