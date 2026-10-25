import { describe, expect, it } from "vitest"
import type { RoundSgResult, SgHoleRow } from "@/lib/rounds/roundSg"
import type { HoleSg } from "@/lib/rounds/sgEstimate"
import { nextLevel } from "./levels"
import { bestImprovement, drillTrends, itemsDone, minutesPractised, mondayOf, primaryDrillScores, tiger5Averages } from "./progress"
import { mergeRuns, runFromPayload, sessionsOf, type DrillRef, type FinishedRun } from "./runs"
import { weaknessScores, type WeaknessRound } from "./weakness"
import { lastWeekSummary, planWeek, type StoredPlan } from "./weekPlan"
import { rebuildWeek } from "./week"

// ---- fixtures ----
const hole = (n: number, o: { putting?: number; putts?: number; approach?: number; start?: number }): [HoleSg, SgHoleRow] => [
  { holeNumber: n, total: 0, categories: { off_tee: 0, approach: o.approach ?? 0, short_game: 0, putting: o.putting ?? 0 }, approachStartYds: o.start ?? null, source: "scorecard", puttEstimated: false },
  { hole_number: n, par: 4, strokes: 4, putts: o.putts ?? 2, fairway_hit: null, green_hit: null, penalty: false, penalty_shot: null, first_putt_ft: null },
]
const round = (holes: Parameters<typeof hole>[1][], three = 0): WeaknessRound => {
  const pairs = holes.map((h, i) => hole(i + 1, h))
  const sg: RoundSgResult = { roundId: "r", kind: "scorecard", holes: pairs.map((p) => p[0]), total: 0, totalPer18: 0, per18: { off_tee: null, approach: null, short_game: null, putting: null }, weakest: null, holesFromShots: 0, holesFromScorecard: pairs.length }
  return { sg, holes: pairs.map((p) => p[1]), tiger5: { holes: [], shots: [], three_putts: three }, score: 80 }
}
const priorities = (scores: ReturnType<typeof weaknessScores>) => Object.fromEntries(scores.map((s) => [s.area, s.priority])) as Parameters<typeof rebuildWeek>[1]

const lagDrill: DrillRef = { id: "lag", name: "Pelz Lag Ladder", metric: "count_of_n", lower_is_better: true, practice_category: "lag_putting", levels: [{ name: "6-ft zone", rule: "" }, { name: "3-ft zone", rule: "" }], sets: [{ label: "20 ft", setup: "", balls: 10 }] }
const gate: DrillRef = { id: "gate", name: "Putting Gate", metric: "count_of_n", lower_is_better: false, practice_category: "short_putting", levels: [{ name: "Wide gate", rule: "" }], sets: [{ label: "Gate", setup: "", balls: 20 }] }
const library = [lagDrill, gate]

let n = 0
const run = (startedAt: string, sets: { drill: string; value: number | null; skipped?: boolean }[], endedAt: string | null = null): FinishedRun => ({
  id: `run${++n}`,
  startedAt,
  endedAt,
  sets: sets.map((s) => ({ drillId: s.drill, value: s.value, skipped: s.skipped ?? s.value == null, attempts: null })),
})

// 2026-10-19 is a Monday.
const MON = "2026-10-19"
const day = (d: number, h = 10) => new Date(2026, 9, 19 + d, h).toISOString()

describe("the week is rebuilt after new rounds", () => {
  it("a round with two 3-putts moves lag putting up", () => {
    const calm = [round([{ putting: -0.1 }, { putting: -0.1 }])]
    const threePutts = [round([{ putting: -1.2, putts: 3 }, { putting: -1.1, putts: 3 }])]
    const before = weaknessScores(calm, {}).find((s) => s.area === "lag_putting")!
    const after = weaknessScores(threePutts, {}).find((s) => s.area === "lag_putting")!
    expect(after.priority).toBeGreaterThan(before.priority)
    expect(rebuildWeek({}, priorities(weaknessScores(threePutts)), { weekdayMinutes: 100, weekendMinutes: 100 }).items[0].area).toBe("lag_putting")
  })

  it("keeps what is done, re-ranks the rest, and never goes over the minutes", () => {
    const p = { lag_putting: 1, short_putting: 5, short_game: 4, wedges: 3, approach: 2, tee: 0 }
    const w = rebuildWeek({ approach: 2, tee: 1 }, p, { weekdayMinutes: 150, weekendMinutes: 150 })
    expect(w.items.find((i) => i.area === "approach")).toMatchObject({ done: 2 })
    expect(w.items.find((i) => i.area === "approach")!.required).toBeGreaterThanOrEqual(2)
    expect(w.items.find((i) => i.area === "tee")).toMatchObject({ done: 1, required: 1 })
    expect(w.items[0].area).toBe("short_putting")
    expect(w.minutes).toBeLessThanOrEqual(300)
  })

  it("adds nothing when the minutes are used up by what is done", () => {
    const w = rebuildWeek({ approach: 10 }, { lag_putting: 9, short_putting: 9, short_game: 9, wedges: 9, approach: 1, tee: 1 }, { weekdayMinutes: 100, weekendMinutes: 100 })
    expect(w.items).toEqual([expect.objectContaining({ area: "approach", required: 10, done: 10 })])
  })
})

describe("a drill that improved three sessions in a row", () => {
  const improving = [run(day(0), [{ drill: "lag", value: 9 }]), run(day(1), [{ drill: "lag", value: 8 }]), run(day(2), [{ drill: "lag", value: 6 }]), run(day(3), [{ drill: "lag", value: 5 }])]
  const rounds = [round([{ putting: -1, putts: 3 }])]

  it("gets its category cut by 25%", () => {
    const plain = weaknessScores(rounds, {}).find((s) => s.area === "lag_putting")!
    const cut = weaknessScores(rounds, primaryDrillScores(improving, library)).find((s) => s.area === "lag_putting")!
    expect(cut.improving).toBe(true)
    expect(cut.priority).toBeCloseTo(plain.priority * 0.75)
  })

  it("is not cut when the last session slipped", () => {
    const slipped = [...improving, run(day(4), [{ drill: "lag", value: 7 }])]
    expect(weaknessScores(rounds, primaryDrillScores(slipped, library)).find((s) => s.area === "lag_putting")!.improving).toBe(false)
  })
})

describe("a skipped set", () => {
  it("never changes a level, and a session of only skipped sets is not a session", () => {
    const history = [[{ skipped: false, score: 2, n: 10 }], [{ skipped: false, score: 1, n: 10 }]] // two poor sessions: down a level
    expect(nextLevel({ level: 1, levelCount: 2, metric: "count_of_n", lowerIsBetter: false, sessions: history })).toBe(0)
    const withSkipped = [...history.slice(0, 1), [{ skipped: true, score: 0, n: 10 }], ...history.slice(1)]
    expect(nextLevel({ level: 1, levelCount: 2, metric: "count_of_n", lowerIsBetter: false, sessions: withSkipped })).toBe(0)
    const good = [[{ skipped: false, score: 9, n: 10 }], [{ skipped: true, score: 0, n: 10 }, { skipped: false, score: 9, n: 10 }]]
    expect(nextLevel({ level: 0, levelCount: 2, metric: "count_of_n", lowerIsBetter: false, sessions: good })).toBe(1)
    const onlySkipped = [run(day(0), [{ drill: "gate", value: null }])]
    expect(sessionsOf(onlySkipped, gate)).toEqual([])
  })
})

describe("progress", () => {
  const runs = [
    run(day(-7), [{ drill: "lag", value: 9 }], day(-7, 11)),
    run(day(0), [{ drill: "lag", value: 6 }, { drill: "gate", value: 12 }], day(0, 11)),
    run(day(1), [{ drill: "gate", value: null }]),
  ]

  it("weeks start on Monday", () => {
    expect(mondayOf(new Date(2026, 9, 25))).toBe(MON) // a Sunday
    expect(mondayOf(new Date(2026, 9, 19))).toBe(MON)
    expect(mondayOf(new Date(2026, 9, 26))).toBe("2026-10-26")
  })

  it("counts each scored drill once per run, and skips skipped ones", () => {
    expect(itemsDone(runs, library, MON)).toEqual({ lag_putting: 1, short_putting: 1 })
  })

  it("adds up minutes from finished runs", () => {
    expect(minutesPractised(runs, MON)).toBe(60)
  })

  it("finds the drill that improved most against the session before the week", () => {
    expect(bestImprovement(runs, library, MON)).toEqual({ name: "Pelz Lag Ladder", from: 9, to: 6 })
  })

  it("trends drills scored 3+ times with their last 5 values and level", () => {
    const many = [...Array(6)].map((_, i) => run(day(i), [{ drill: "lag", value: 10 - i }]))
    const [t] = drillTrends([...many, ...runs.slice(2)], library, { lag: 1 })
    expect(t).toMatchObject({ name: "Pelz Lag Ladder", values: [9, 8, 7, 6, 5], sessions: 6, level: "3-ft zone", lowerIsBetter: true })
    expect(drillTrends(runs, library, {})).toEqual([])
  })

  it("averages Tiger 5 for the week against the recent rounds", () => {
    const t = tiger5Averages([{ date: "2026-10-20", total: 2 }, { date: "2026-10-21", total: 4 }, { date: "2026-10-05", total: 6 }], MON)
    expect(t.week).toBe(3)
    expect(t.recent).toBe(4)
    expect(tiger5Averages([], MON)).toEqual({ week: null, recent: null })
  })

  it("reads a finished run from the outbox, and not one still going", () => {
    const payload = { userId: "u", run: { id: "x", date: "d", location: "l", startedAt: day(0), endedAt: day(0, 11), status: "completed" as const, notes: null, source: "session" as const }, sets: [{ stepIndex: 0, blockIndex: 0, drillId: "lag", label: "", club: null, skipped: false, value: 4, attempts: null, spread: null, at: day(0) }], levelChanges: [] }
    expect(runFromPayload(payload)?.sets[0].value).toBe(4)
    expect(runFromPayload({ ...payload, run: { ...payload.run, status: "running" } })).toBeNull()
    expect(mergeRuns([run(day(0), [], null)].map((r) => ({ ...r, id: "x" })), [runFromPayload(payload) as FinishedRun])).toHaveLength(1)
  })
})

describe("planWeek", () => {
  const scoresFor = (rounds: WeaknessRound[]) => weaknessScores(rounds, {})
  const wedgeRounds = [round([{ approach: -1, start: 100 }, { approach: -1, start: 90 }])]
  const putterRounds = [round([{ putting: -1, putts: 3 }, { putting: -1, putts: 3 }])]
  const monday = new Date(2026, 9, 26, 9)
  const lastWeek: StoredPlan = { current: { weekStart: MON, items: [{ area: "lag_putting", required: 3 }, { area: "short_putting", required: 2 }], topArea: "lag_putting" }, last: null }

  it("turns last week into the Last week row and explains a new top priority", () => {
    const view = planWeek({ stored: lastWeek, now: monday, scores: scoresFor(wedgeRounds), done: {} })
    expect(view.last?.weekStart).toBe(MON)
    expect(view.topChange).toMatch(/^Wedges moved up: /)
    expect(view.next.current.weekStart).toBe("2026-10-26")
    expect(view.next.last?.weekStart).toBe(MON)
  })

  it("says nothing when the top priority is the same", () => {
    expect(planWeek({ stored: lastWeek, now: monday, scores: scoresFor(putterRounds), done: {} }).topChange).toBeNull()
  })

  it("forgets a stored week from more than a week ago", () => {
    const old: StoredPlan = { current: { ...lastWeek.current, weekStart: "2026-09-28" }, last: null }
    expect(planWeek({ stored: old, now: monday, scores: scoresFor(wedgeRounds), done: {} }).last).toBeNull()
  })

  it("summarizes last week from the runs", () => {
    const runs = [run(day(0), [{ drill: "lag", value: 6 }], day(0, 11)), run(day(-7), [{ drill: "lag", value: 9 }])]
    const s = lastWeekSummary(lastWeek.current, runs, library, [{ date: "2026-10-20", total: 2 }])
    expect(s).toMatchObject({ done: 1, planned: 5, minutes: 60, best: { name: "Pelz Lag Ladder", from: 9, to: 6 } })
    expect(s.tiger5).toEqual({ week: 2, recent: 2 })
  })
})
