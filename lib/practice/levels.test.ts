import { describe, it, expect } from "vitest"
import { nextLevel, setSuccess, type SetResult } from "./levels"

const sess = (...scores: number[]): SetResult[][] => scores.map((s) => [{ skipped: false, score: s, n: 10 }])
const move = (sessions: SetResult[][], level = 1) => nextLevel({ level, levelCount: 3, metric: "count_of_n", lowerIsBetter: false, sessions })

describe("setSuccess", () => {
  it("counts out of n, flipped when lower is better", () => {
    expect(setSuccess("count_of_n", false, { skipped: false, score: 7, n: 10 })).toBeCloseTo(0.7)
    expect(setSuccess("count_of_n", true, { skipped: false, score: 3, n: 10 })).toBeCloseTo(0.7)
  })

  it("scores a streak against its target, strokes against par and a percentage as it is", () => {
    expect(setSuccess("streak", false, { skipped: false, score: 5, target: 10 })).toBe(0.5)
    expect(setSuccess("strokes", true, { skipped: false, score: 6, target: 3 })).toBe(0.5)
    expect(setSuccess("pct", false, { skipped: false, score: 80 })).toBe(0.8)
  })

  it("is null for a skipped set or a missing n", () => {
    expect(setSuccess("count_of_n", false, { skipped: true, score: 10, n: 10 })).toBeNull()
    expect(setSuccess("count_of_n", false, { skipped: false, score: 10 })).toBeNull()
  })
})

describe("nextLevel", () => {
  it("goes up after two sessions above 70%", () => {
    expect(move(sess(8, 9))).toBe(2)
  })

  it("goes down after two sessions below 50%", () => {
    expect(move(sess(4, 3))).toBe(0)
  })

  it("stays on exactly 70% and exactly 50%", () => {
    expect(move(sess(7, 7))).toBe(1)
    expect(move(sess(5, 5))).toBe(1)
  })

  it("needs the last two sessions to agree", () => {
    expect(move(sess(8, 6, 9))).toBe(1)
    expect(move(sess(3, 4, 9, 9))).toBe(2)
  })

  it("needs two sessions", () => {
    expect(move(sess(9))).toBe(1)
  })

  it("stays inside the drill's levels", () => {
    expect(move(sess(9, 9), 2)).toBe(2)
    expect(move(sess(1, 1), 0)).toBe(0)
  })

  it("lets a skipped set count for nothing", () => {
    const skippedSet: SetResult[][] = [[{ skipped: true, score: 0, n: 10 }, { skipped: false, score: 9, n: 10 }], [{ skipped: false, score: 8, n: 10 }]]
    expect(move(skippedSet)).toBe(2)
    const allSkipped: SetResult[][] = [[{ skipped: true, score: 0, n: 10 }], [{ skipped: true, score: 0, n: 10 }]]
    expect(move(allSkipped)).toBe(1)
    const skippedBetween: SetResult[][] = [...sess(9), [{ skipped: true, score: 0, n: 10 }], ...sess(9)]
    expect(move(skippedBetween)).toBe(2)
  })
})
