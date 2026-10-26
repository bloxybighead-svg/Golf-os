import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ACTIVE_SESSION_KEY, loadActiveSession, newActiveSession, saveActiveSession, type ActiveSession } from "./activeSession"
import { blockTimer, closeoutPutt, currentStep, cutoffNotice, endEarly, jumpToCloseout, progress, recordEntry, scoreColumns, scoredSets, skipSet, summarize, toRunPayload, undoLast, UNDO_MS } from "./runner"
import type { SessionBlock, SessionPlan } from "./session"

const block = (o: Partial<SessionBlock> & Pick<SessionBlock, "drillId" | "name" | "kind">): SessionBlock => ({
  category: "lag_putting",
  startsAt: new Date(2026, 9, 21, 10),
  minutes: 20,
  balls: 10,
  sets: [{ label: "Set", setup: "10 putts", balls: 10 }],
  routineRule: "Full routine every ball.",
  cue: "Roll it to the circle.",
  metric: "count_of_n",
  lowerIsBetter: false,
  level: { index: 0, name: "3-ft zone", rule: "r" },
  ...o,
})

const ladder = block({
  drillId: "ladder",
  name: "Lag ladder",
  kind: "drill",
  minutes: 20,
  lowerIsBetter: true,
  sets: [20, 30, 40, 50].map((ft) => ({ label: `${ft} ft`, setup: `10 putts from ${ft} ft`, balls: 10 })),
})
const closeout = block({
  drillId: "close",
  name: "Three 4-Footers",
  kind: "closeout",
  category: "closeout",
  minutes: 5,
  metric: "strokes",
  lowerIsBetter: true,
  sets: [{ label: "4 ft", setup: "3 in a row", balls: 3 }],
})
const plan = (blocks: SessionBlock[]): SessionPlan => ({ off: false, blocks, practiceMinutes: 25, loggingMinutes: 5, endsAt: null, notes: [] })

const T0 = new Date(2026, 9, 21, 10).getTime()
const fresh = (o: Partial<Parameters<typeof newActiveSession>[0]> = {}): ActiveSession =>
  newActiveSession({ id: "run1", userId: "u1", date: "2026-10-21", location: "putting_green", now: T0, plan: plan([ladder, closeout]), ...o })

describe("setting up", () => {
  it("makes one step per set, in order", () => {
    const s = fresh()
    expect(s.steps.map((x) => x.label)).toEqual(["20 ft", "30 ft", "40 ft", "50 ft", "4 ft"])
    expect(progress(s)).toEqual({ done: 0, total: 5 })
    expect(currentStep(s)?.setIndex).toBe(0)
  })
})

describe("saving a set", () => {
  it("saves the value and opens the next set", () => {
    const s = recordEntry(fresh(), { value: 3 }, T0 + 1000)
    expect(s.entries).toHaveLength(1)
    expect(s.entries[0]).toMatchObject({ skipped: false, value: 3 })
    expect(currentStep(s)?.label).toBe("30 ft")
    expect(progress(s).done).toBe(1)
  })

  it("completes after the last set", () => {
    let s = fresh()
    for (let i = 0; i < 5; i++) s = recordEntry(s, { value: 1 }, T0 + i)
    expect(s.status).toBe("completed")
    expect(currentStep(s)).toBeNull()
  })

  it("starts a block's clock when its first set opens", () => {
    let s = fresh()
    for (let i = 0; i < 3; i++) s = recordEntry(s, { value: 1 }, T0 + i)
    expect(s.blocks[1].startedAt).toBeNull()
    s = recordEntry(s, { value: 1 }, T0 + 60_000)
    expect(s.blocks[1].startedAt).toBe(T0 + 60_000)
  })
})

describe("skipping", () => {
  it("saves skipped with no value, never 0", () => {
    const s = skipSet(fresh(), T0 + 1000)
    expect(s.entries[0]).toMatchObject({ skipped: true, value: null })
    expect(currentStep(s)?.label).toBe("30 ft")
    const sent = toRunPayload(s, null).sets[0]
    expect(sent.skipped).toBe(true)
    expect(sent.value).toBeNull()
  })
})

describe("undo", () => {
  it("takes back the last save within 5 seconds", () => {
    const saved = recordEntry(fresh(), { value: 4 }, T0)
    const undone = undoLast(saved, T0 + UNDO_MS)
    expect(undone.entries).toHaveLength(0)
    expect(currentStep(undone)?.label).toBe("20 ft")
  })

  it("does nothing after 5 seconds, or twice", () => {
    const saved = recordEntry(fresh(), { value: 4 }, T0)
    expect(undoLast(saved, T0 + UNDO_MS + 1)).toBe(saved)
    const once = undoLast(saved, T0 + 1000)
    expect(undoLast(once, T0 + 1500)).toBe(once)
  })

  it("reopens a session that the last save had completed, and un-clocks the next block", () => {
    let s = fresh()
    for (let i = 0; i < 4; i++) s = recordEntry(s, { value: 1 }, T0 + i)
    expect(s.blocks[1].startedAt).not.toBeNull()
    s = undoLast(s, T0 + 3 + 100)
    expect(s.blocks[1].startedAt).toBeNull()
    expect(currentStep(s)?.label).toBe("50 ft")
  })
})

describe("ending early", () => {
  it("saves status ended_early and stops the sets", () => {
    const s = endEarly(recordEntry(fresh(), { value: 2 }, T0))
    expect(s.status).toBe("ended_early")
    expect(currentStep(s)).toBeNull()
    expect(toRunPayload(s, null).run.status).toBe("ended_early")
  })
})

describe("reopening the app", () => {
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

  it("resumes on the same set", () => {
    saveActiveSession(recordEntry(recordEntry(fresh(), { value: 5 }, T0), { value: 6 }, T0 + 1))
    const back = loadActiveSession() as ActiveSession
    expect(currentStep(back)?.label).toBe("40 ft")
    expect(back.entries.map((e) => e.value)).toEqual([5, 6])
  })

  it("ignores a stored value that is not a session", () => {
    store.set(ACTIVE_SESSION_KEY, JSON.stringify({ id: "x" }))
    expect(loadActiveSession()).toBeNull()
    store.set(ACTIVE_SESSION_KEY, "not json")
    expect(loadActiveSession()).toBeNull()
  })
})

describe("close-out", () => {
  it("a miss restarts the count at 0 and still counts the putt", () => {
    let r = closeoutPutt({ made: 0, putts: 0 }, true, 3)
    r = closeoutPutt(r.state, true, 3)
    expect(r.state).toEqual({ made: 2, putts: 2 })
    r = closeoutPutt(r.state, false, 3)
    expect(r.state).toEqual({ made: 0, putts: 3 })
    expect(r.passed).toBe(false)
  })

  it("passes on the third make in a row, scoring the putts taken", () => {
    let st = { made: 0, putts: 0 }
    for (const made of [true, true, false, true, true, true]) {
      const r = closeoutPutt(st, made, 3)
      st = r.state
      if (made && st.made === 3) expect(r.passed).toBe(true)
    }
    expect(st.putts).toBe(6)
  })
})

describe("jump to close-out", () => {
  it("saves the sets in between as skipped and lands on the close-out", () => {
    const s = jumpToCloseout(recordEntry(fresh(), { value: 2 }, T0), T0 + 5000)
    expect(s.entries.map((e) => e.skipped)).toEqual([false, true, true, true])
    expect(currentStep(s)?.kind).toBe("closeout")
    expect(s.blocks[1].startedAt).toBe(T0 + 5000)
  })
})

describe("timer", () => {
  it("turns over once the block is 3 minutes past its plan", () => {
    const s = fresh()
    expect(blockTimer(s, T0 + 22 * 60_000)?.over).toBe(false)
    expect(blockTimer(s, T0 + 23 * 60_000)?.over).toBe(true)
  })
})

describe("cutoff notice", () => {
  const at = (h: number, m: number) => new Date(2026, 9, 21, h, m).getTime()
  it("shows once the rest of the plan would run past 8:40 pm", () => {
    expect(cutoffNotice(fresh(), at(20, 40))).toEqual({ minutes: 5 })
    expect(cutoffNotice(fresh(), at(20, 20))).toEqual({ minutes: 25 })
  })
  it("stays away early in the evening, and on the close-out itself", () => {
    expect(cutoffNotice(fresh(), at(18, 0))).toBeNull()
    expect(cutoffNotice(jumpToCloseout(fresh(), at(20, 40)), at(20, 41))).toBeNull()
  })
  it("stays away with no close-out ahead", () => {
    expect(cutoffNotice(fresh({ plan: plan([ladder]) }), at(20, 41))).toBeNull()
  })
})

describe("summary", () => {
  const withLevel = () =>
    fresh({
      previous: { ladder: 9, close: 5 },
      levels: { ladder: { index: 0, names: ["3-ft zone", "2-ft zone"], history: [[{ skipped: false, score: 1, n: 10 }]] } },
    })
  const play = (s: ActiveSession, values: number[]) => values.reduce((acc, v) => recordEntry(acc, { value: v }, T0), s)

  it("totals each drill against last time", () => {
    const s = play(withLevel(), [1, 2, 1, 2, 4])
    const [lag, out] = summarize(s)
    expect(lag).toMatchObject({ name: "Lag ladder", result: "6 of 40", last: 9 })
    expect(out).toMatchObject({ name: "Three 4-Footers", result: "4 putts", last: 5 })
  })

  it("moves a level up after two sessions above 70% (lower is better: few outside)", () => {
    const s = play(withLevel(), [1, 2, 1, 2, 3])
    const lag = summarize(s)[0]
    expect(lag.level).toEqual({ from: "3-ft zone", to: "2-ft zone", moved: "up" })
    expect(toRunPayload(s, { at: T0 }).levelChanges).toEqual([{ drillId: "ladder", level: 1 }])
    expect(toRunPayload(s, null).levelChanges).toEqual([])
  })

  it("leaves a skipped drill alone", () => {
    let s = withLevel()
    for (let i = 0; i < 4; i++) s = skipSet(s, T0)
    const lag = summarize(s)[0]
    expect(lag.skipped).toBe(true)
    expect(lag.result).toBe("skipped")
    expect(lag.level.moved).toBeNull()
  })
})

describe("score buttons and scored sets", () => {
  it("sizes the grid to the option count: one row to 7, two even rows to 14, then a stepper", () => {
    expect(scoreColumns(6)).toBe(6)
    expect(scoreColumns(7)).toBe(7)
    expect(scoreColumns(11)).toBe(6)
    expect(scoreColumns(14)).toBe(7)
    expect(scoreColumns(15)).toBeNull()
  })

  it("counts only sets with a score; skipped sets do not count", () => {
    const s = skipSet(recordEntry(fresh(), { value: 0 }, T0), T0 + 1)
    expect(scoredSets(s)).toBe(1)
    expect(scoredSets(fresh())).toBe(0)
  })
})
