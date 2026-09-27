import { describe, it, expect } from "vitest"
import { computeUserSg, handicapBracketRange, aggregateCategoryTrends, qualifierFor } from "./sgBenchmarks"

describe("computeUserSg", () => {
  it("returns exactly zero for every category at the scratch reference stats", () => {
    const result = computeUserSg({
      holesPlayed: 18,
      fairwaysPct: 56.5,
      girPct: 55,
      totalPutts: 30,
      upAndDowns: 18 * (1 - 0.55) * 0.5, // scratch's own 50% up-and-down rate
    })
    for (const r of result) expect(r.userSg).toBeCloseTo(0, 5)
  })

  it("matches the hand-worked (2,5]-bracket arithmetic used to seed sg_benchmarks", () => {
    // Same inputs as the (2,5) bracket row in supabase/sg_benchmarks.sql.
    const missedGreens = 18 * (1 - 0.461)
    const result = computeUserSg({
      holesPlayed: 18,
      fairwaysPct: 51.0,
      girPct: 46.1,
      totalPutts: 32,
      upAndDowns: missedGreens * 0.377,
    })
    const byCategory = Object.fromEntries(result.map((r) => [r.category, r.userSg]))
    expect(byCategory.off_tee).toBeCloseTo(-0.15, 1)
    expect(byCategory.approach).toBeCloseTo(-0.8, 1)
    expect(byCategory.short_game).toBeCloseTo(-0.6, 1)
    expect(byCategory.putting).toBe(-2)
  })

  it("scales off-tee/approach/putting to a 9-hole round rather than treating it like a full 18", () => {
    const full18 = computeUserSg({ holesPlayed: 18, fairwaysPct: 40, girPct: 30, totalPutts: 20, upAndDowns: 3 })
    const half9 = computeUserSg({ holesPlayed: 9, fairwaysPct: 40, girPct: 30, totalPutts: 10, upAndDowns: 1.5 })
    const f = Object.fromEntries(full18.map((r) => [r.category, r.userSg]))
    const h = Object.fromEntries(half9.map((r) => [r.category, r.userSg]))
    expect(h.off_tee).toBeCloseTo(f.off_tee / 2, 1)
    expect(h.approach).toBeCloseTo(f.approach / 2, 1)
    expect(h.putting).toBeCloseTo(f.putting / 2, 1)
  })

  it("omits a category when the round is missing the stat it needs", () => {
    const result = computeUserSg({ holesPlayed: 18, fairwaysPct: null, girPct: null, totalPutts: 32, upAndDowns: null })
    expect(result.map((r) => r.category)).toEqual(["putting"])
  })

  it("omits short_game specifically when up_and_downs is missing even though GIR is present", () => {
    const result = computeUserSg({ holesPlayed: 18, fairwaysPct: null, girPct: 50, totalPutts: null, upAndDowns: null })
    expect(result.map((r) => r.category)).toEqual(["approach"])
  })

  it("clamps an up-and-down rate that would exceed 100% rather than producing a runaway positive", () => {
    // Fewer missed greens than up-and-downs logged (inconsistent manual entry) -- rate clamps to 100%.
    const result = computeUserSg({ holesPlayed: 18, fairwaysPct: null, girPct: 90, totalPutts: null, upAndDowns: 10 })
    const shortGame = result.find((r) => r.category === "short_game")!
    // missedGreens = 18*0.1 = 1.8; rate clamps to 100% instead of 10/1.8=555%
    expect(shortGame.userSg).toBeCloseTo(((100 - 50) / 100) * 1.8 * 0.5, 2)
  })
})

describe("handicapBracketRange", () => {
  it("puts a mid-2s handicap (e.g. Dillon's ~2.4) in the (2,5] bracket, not a gap", () => {
    expect(handicapBracketRange(2.4)).toEqual({ low: 2, high: 5 })
  })

  it("resolves an exact boundary value to the lower bracket", () => {
    expect(handicapBracketRange(2)).toEqual({ low: 0, high: 2 })
    expect(handicapBracketRange(5)).toEqual({ low: 2, high: 5 })
  })

  it("falls back to the highest bracket for a handicap beyond every listed range", () => {
    expect(handicapBracketRange(50)).toEqual({ low: 25, high: 36 })
  })

  it("handles a plus-handicap golfer via the lowest bracket rather than falling through", () => {
    expect(handicapBracketRange(-1.5)).toEqual({ low: 0, high: 2 })
  })
})

describe("aggregateCategoryTrends", () => {
  it("averages per category and keeps categories in a fixed display order regardless of input order", () => {
    const rows = [
      { category: "putting" as const, user_sg: -1, benchmark_sg: -2, delta_sg: 1 },
      { category: "off_tee" as const, user_sg: -0.1, benchmark_sg: -0.15, delta_sg: 0.05 },
      { category: "putting" as const, user_sg: -3, benchmark_sg: -2, delta_sg: -1 },
    ]
    const trends = aggregateCategoryTrends(rows)
    expect(trends.map((t) => t.category)).toEqual(["off_tee", "putting"])
    const putting = trends.find((t) => t.category === "putting")!
    expect(putting.avgDeltaSg).toBe(0) // (1 + -1) / 2
    expect(putting.roundsCounted).toBe(2)
  })

  it("omits a category entirely when no rows have it, rather than showing a false zero", () => {
    const trends = aggregateCategoryTrends([{ category: "approach", user_sg: 0.1, benchmark_sg: 0, delta_sg: 0.1 }])
    expect(trends).toHaveLength(1)
    expect(trends[0].category).toBe("approach")
  })
})

describe("qualifierFor", () => {
  it("buckets a clearly positive delta as elite and a clearly negative one as needs work", () => {
    expect(qualifierFor(0.5)).toBe("Elite for your HCP")
    expect(qualifierFor(-0.5)).toBe("Needs work")
  })

  it("treats a small delta around zero as average, not elite/needs-work noise", () => {
    expect(qualifierFor(0.1)).toBe("Above average")
    expect(qualifierFor(-0.1)).toBe("Average")
  })
})
