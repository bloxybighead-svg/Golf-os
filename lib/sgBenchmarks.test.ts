import { describe, it, expect } from "vitest"
import { computeUserSg } from "./sgBenchmarks"

describe("computeUserSg", () => {
  it("returns exactly zero for every category at the scratch reference stats", () => {
    const result = computeUserSg({
      holesPlayed: 18,
      fairwaysPct: 56.5,
      girPct: 55,
      totalPutts: 30,
      upAndDowns: 18 * (1 - 0.55) * 0.5, // scratch's own 50% up-and-down rate
      teePenalties: 0,
    })
    for (const r of result) expect(r.userSg).toBeCloseTo(0, 5)
  })

  it("matches the hand-worked (2,5]-bracket arithmetic used to seed sg_benchmarks", () => {
    // Same inputs as the (2,5) bracket row in supabase/migrations/0001_baseline.sql.
    const missedGreens = 18 * (1 - 0.461)
    const result = computeUserSg({
      holesPlayed: 18,
      fairwaysPct: 51.0,
      girPct: 46.1,
      totalPutts: 32,
      upAndDowns: missedGreens * 0.377,
      teePenalties: 0,
    })
    const byCategory = Object.fromEntries(result.map((r) => [r.category, r.userSg]))
    expect(byCategory.off_tee).toBeCloseTo(-0.15, 1)
    expect(byCategory.approach).toBeCloseTo(-0.8, 1)
    expect(byCategory.short_game).toBeCloseTo(-0.6, 1)
    expect(byCategory.putting).toBe(-2)
  })

  it("scales off-tee/approach/putting to a 9-hole round rather than treating it like a full 18", () => {
    const full18 = computeUserSg({ holesPlayed: 18, fairwaysPct: 40, girPct: 30, totalPutts: 20, upAndDowns: 3, teePenalties: 0 })
    const half9 = computeUserSg({ holesPlayed: 9, fairwaysPct: 40, girPct: 30, totalPutts: 10, upAndDowns: 1.5, teePenalties: 0 })
    const f = Object.fromEntries(full18.map((r) => [r.category, r.userSg]))
    const h = Object.fromEntries(half9.map((r) => [r.category, r.userSg]))
    expect(h.off_tee).toBeCloseTo(f.off_tee / 2, 1)
    expect(h.approach).toBeCloseTo(f.approach / 2, 1)
    expect(h.putting).toBeCloseTo(f.putting / 2, 1)
  })

  it("omits a category when the round is missing the stat it needs", () => {
    const result = computeUserSg({ holesPlayed: 18, fairwaysPct: null, girPct: null, totalPutts: 32, upAndDowns: null, teePenalties: 0 })
    expect(result.map((r) => r.category)).toEqual(["putting"])
  })

  it("omits short_game specifically when up_and_downs is missing even though GIR is present", () => {
    const result = computeUserSg({ holesPlayed: 18, fairwaysPct: null, girPct: 50, totalPutts: null, upAndDowns: null, teePenalties: 0 })
    expect(result.map((r) => r.category)).toEqual(["approach"])
  })

  it("clamps an up-and-down rate that would exceed 100% rather than producing a runaway positive", () => {
    // Fewer missed greens than up-and-downs logged (inconsistent manual entry) -- rate clamps to 100%.
    const result = computeUserSg({ holesPlayed: 18, fairwaysPct: null, girPct: 90, totalPutts: null, upAndDowns: 10, teePenalties: 0 })
    const shortGame = result.find((r) => r.category === "short_game")!
    // missedGreens = 18*0.1 = 1.8; rate clamps to 100% instead of 10/1.8=555%
    expect(shortGame.userSg).toBeCloseTo(((100 - 50) / 100) * 1.8 * 0.5, 2)
  })
})

describe("off-tee tee penalties", () => {
  const base = { holesPlayed: 18, fairwaysPct: 56.5, girPct: null, totalPutts: null, upAndDowns: null }
  const offTee = (teePenalties: number, holesPlayed = 18) =>
    computeUserSg({ ...base, holesPlayed, teePenalties }).find((r) => r.category === "off_tee")!.userSg

  it("costs one stroke per tee penalty on top of the fairway gap", () => {
    expect(offTee(0)).toBe(0)
    expect(offTee(2)).toBe(-2)
  })

  it("is not scaled down for a 9-hole round", () => {
    expect(offTee(1, 9)).toBe(-1)
  })
})
