import { describe, it, expect } from "vitest"
import { calcDifferential, estimateHandicapIndex } from "./handicap"

describe("calcDifferential", () => {
  it("matches a hand-worked 18-hole example", () => {
    // (74 - 71.4) * 113 / 128 = 2.296... -> 2.3
    expect(calcDifferential(74, 71.4, 128)).toBe(2.3)
  })

  it("uses the exact same formula for a 9-hole round -- no scaling", () => {
    // (40 - 35.6) * 113 / 140 = 3.550... -> 3.6, same shape as an 18-hole calc
    expect(calcDifferential(40, 35.6, 140)).toBe(3.6)
  })

  it("returns null when rating or slope is missing", () => {
    expect(calcDifferential(80, NaN, 130)).toBeNull()
    expect(calcDifferential(80, 72, NaN)).toBeNull()
  })

  it("returns null for a zero slope rather than dividing by zero", () => {
    expect(calcDifferential(80, 72, 0)).toBeNull()
  })
})

describe("estimateHandicapIndex", () => {
  it("returns null with fewer than 8 differentials", () => {
    expect(estimateHandicapIndex([1, 2, 3])).toBeNull()
  })

  it("averages the best 8 of up to 20 most-recent differentials and applies 0.96", () => {
    // best 8 of these ascending values: 0.9,0.9,1.1,1.9,1.9,3.6,3.7,4.5 -> avg 2.3125 * 0.96 = 2.22
    const diffs = [3.6, 6, 13, 4.8, 3.7, 5.4, 5.6, 1.9, 1.9, 7, 4.5, 6.2, 0.9, 0.9, 1.1]
    expect(estimateHandicapIndex(diffs)).toBe(2.2)
  })

  it("only considers the first 20 entries (most-recent-first) even if more are passed", () => {
    const last20 = Array(20).fill(20) // way worse than the extra entries beyond it
    const veryGoodOlderRounds = Array(5).fill(0)
    expect(estimateHandicapIndex([...last20, ...veryGoodOlderRounds])).toBe(19.2)
  })

  it("truncates rather than rounds", () => {
    // 8 identical differentials of 5.09 -> avg 5.09 * 0.96 = 4.8864 -> truncates to 4.8, not 4.9
    expect(estimateHandicapIndex(Array(8).fill(5.09))).toBe(4.8)
  })
})
