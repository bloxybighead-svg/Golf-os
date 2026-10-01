import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"
import {
  adjustHoles,
  calcDifferential,
  courseHandicap,
  expectedNineHoleDifferential,
  handicapIndexFrom,
  needsNewCalculatedEntry,
  recalculateRounds,
  roundTenth,
  scoreDifferential,
  strokesReceived,
  type HoleScore,
  type RoundForHandicap,
} from "./handicap"

describe("Handicap Index (WHS Rule 5.2 table)", () => {
  it("needs at least 3 differentials", () => {
    expect(handicapIndexFrom([])).toBeNull()
    expect(handicapIndexFrom([10, 12])).toBeNull()
  })
  it("3: lowest 1, -2.0", () => {
    expect(handicapIndexFrom([14, 10, 12])).toBe(8)
  })
  it("5: lowest 1, no adjustment", () => {
    expect(handicapIndexFrom([14, 10, 12, 11, 13])).toBe(10)
  })
  it("6: average of lowest 2, -1.0", () => {
    expect(handicapIndexFrom([14, 10, 12, 11, 13, 15])).toBe(9.5) // (10 + 11) / 2 - 1
  })
  it("8: average of lowest 2", () => {
    expect(handicapIndexFrom([14, 10, 12, 11, 13, 15, 16, 17])).toBe(10.5)
  })
  it("12: average of lowest 4", () => {
    const d = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9]
    expect(handicapIndexFrom(d)).toBe(10.5) // (9 + 10 + 11 + 12) / 4
  })
  it("20: average of lowest 8, and only the most recent 20 count", () => {
    const d = Array.from({ length: 20 }, (_, i) => 10 + i) // 10..29
    expect(handicapIndexFrom(d)).toBe(13.5) // (10 + ... + 17) / 8
    expect(handicapIndexFrom([...d, 0, 0, 0])).toBe(13.5) // older rounds past 20 ignored
  })
  it("rounds to the nearest tenth (.5 up), not truncated", () => {
    // lowest 8 average 10.25 -> 10.3 (the old code truncated to 10.2)
    expect(handicapIndexFrom([10.2, 10.3, 10.2, 10.3, 10.2, 10.3, 10.2, 10.3, ...Array(12).fill(20)])).toBe(10.3)
    expect(roundTenth(15.65)).toBe(15.7)
    expect(roundTenth(-0.05)).toBe(0)
  })
  it("caps at 54.0", () => {
    expect(handicapIndexFrom([70, 72, 75])).toBe(54)
  })
  it("has no 0.96 multiplier: 20 differentials of 10.0 give exactly 10.0", () => {
    expect(handicapIndexFrom(Array(20).fill(10))).toBe(10)
  })
  it("no 0.96 anywhere in the handicap code or its explainer", () => {
    for (const f of ["lib/handicap.ts", "lib/supabase/syncHandicap.ts", "components/home/HandicapCard.tsx"]) {
      expect(readFileSync(path.resolve(__dirname, "..", f), "utf8")).not.toMatch(/0\.96|× ?0\.96|x ?0\.96/)
    }
  })
})

describe("Course Handicap and strokes received", () => {
  it("is index x slope/113 + (rating - par), rounded to a whole number", () => {
    // 3.0 x 137/113 + (73.4 - 72) = 3.64 + 1.4 = 5.04 -> 5
    expect(courseHandicap(3.0, 137, 73.4, 72)).toBe(5)
    // .5 rounds up: 2.5 x 113/113 + 0 = 2.5 -> 3
    expect(courseHandicap(2.5, 113, 72, 72)).toBe(3)
  })
  it("a 9-hole Course Handicap uses half the index (to a tenth)", () => {
    // 14.0 / 2 = 7.0 x 120/113 = 7.43 + (35.5 - 36) = 6.93 -> 7
    expect(courseHandicap(14, 120, 35.5, 36, 9)).toBe(7)
  })
  it("gives strokes on the hardest holes first, two where the handicap is over 18", () => {
    expect(strokesReceived(20, 1, 18)).toBe(2)
    expect(strokesReceived(20, 2, 18)).toBe(2)
    expect(strokesReceived(20, 3, 18)).toBe(1)
    expect(strokesReceived(5, 5, 18)).toBe(1)
    expect(strokesReceived(5, 6, 18)).toBe(0)
    expect(strokesReceived(5, 5, 9)).toBe(1) // a 9-hole round ranks its own nine
  })
  it("a plus handicap gives strokes back on the easiest holes", () => {
    expect(strokesReceived(-2, 18, 18)).toBe(-1)
    expect(strokesReceived(-2, 17, 18)).toBe(-1)
    expect(strokesReceived(-2, 16, 18)).toBe(0)
  })
})

/** 18 par-4 holes with stroke indexes 1..18, all scored `strokes` except overrides. */
function card(strokes: number, overrides: Record<number, number> = {}, withSi = true): HoleScore[] {
  return Array.from({ length: 18 }, (_, i) => ({ par: 4, strokes: overrides[i + 1] ?? strokes, strokeIndex: withSi ? i + 1 : null }))
}

describe("net double bogey (Rule 3.1)", () => {
  it("with a stroke index: par + 2 + strokes received on that hole", () => {
    // index 10, slope 113, rating = par = 72 -> Course Handicap 10: SI 1-10 get a stroke
    const holes = card(4, { 1: 9, 18: 8 }) // a 9 on the hardest hole, an 8 on the easiest
    const r = adjustHoles(holes, { index: 10, rating: 72, slope: 113 })
    expect(r.cap).toBe("net_double_bogey")
    expect(r.holeCaps[0]).toBe(7) // par 4 + 2 + 1
    expect(r.holeCaps[17]).toBe(6) // par 4 + 2 + 0
    expect(r.adjusted).toBe(16 * 4 + 7 + 6) // 9 -> 7, 8 -> 6
  })
  it("without stroke indexes: par + 2 + the course handicap spread evenly, marked approximate", () => {
    const r = adjustHoles(card(4, { 1: 9, 18: 8 }, false), { index: 10, rating: 72, slope: 113 })
    expect(r.cap).toBe("approximate")
    expect(r.holeCaps.every((c) => c === 7)).toBe(true) // 10 / 18 = 0.56 -> 1 each
    expect(r.adjusted).toBe(16 * 4 + 7 + 7)
  })
  it("before there's an index: par + 5", () => {
    const r = adjustHoles(card(4, { 1: 11, 18: 8 }), { index: null, rating: 72, slope: 113 })
    expect(r.cap).toBe("par_plus_5")
    expect(r.adjusted).toBe(16 * 4 + 9 + 8) // 11 -> 9, 8 stays
  })
})

describe("score differentials", () => {
  it("18 holes: (113 / slope) x (adjusted - rating), to a tenth", () => {
    expect(scoreDifferential({ adjusted: 74, rating: 71.4, slope: 128, holes: 18 }, null)).toEqual({ differential: 2.3, status: "rated" })
  })
  it("9 holes with an index: 9-hole differential + expected 9-hole differential (the USGA's worked example)", () => {
    // USGA FAQ: index 14.0, 9-hole differential 7.2 -> 18-hole differential 15.7
    expect(expectedNineHoleDifferential(14)).toBeCloseTo(8.48, 10)
    expect(scoreDifferential({ adjusted: 41, rating: 33.8, slope: 113, holes: 9 }, 14)).toEqual({ differential: 15.7, status: "rated" })
  })
  it("9 holes without an index: waits", () => {
    expect(scoreDifferential({ adjusted: 41, rating: 33.8, slope: 113, holes: 9 }, null)).toEqual({ differential: null, status: "waiting_for_index" })
  })
  it("10-17 holes: played + expected for the unplayed holes", () => {
    // 14 holes, played differential (60 - 55) x 113/113 = 5, + (0.52 x 10 + 1.2) x 4/9 = 2.84 -> 7.8
    expect(scoreDifferential({ adjusted: 60, rating: 55, slope: 113, holes: 14 }, 10)).toEqual({ differential: 7.8, status: "rated" })
  })
  it("no differential under 9 holes or without a rating", () => {
    expect(scoreDifferential({ adjusted: 30, rating: 27, slope: 130, holes: 7 }, 10).status).toBe("too_short")
    expect(scoreDifferential({ adjusted: 80, rating: null, slope: 130, holes: 18 }, 10).status).toBe("no_rating")
    expect(scoreDifferential({ adjusted: 80, rating: 72, slope: 0, holes: 18 }, 10).status).toBe("no_rating")
  })
  it("the form preview only does 18 holes (no ×18/holes doubling any more)", () => {
    expect(calcDifferential(74, 71.4, 128)).toBe(2.3)
    expect(calcDifferential(40, 35.6, 140, 9)).toBeNull()
  })
})

let n = 0
function round(date: string, score: number, opts: Partial<RoundForHandicap> = {}): RoundForHandicap {
  n += 1
  return { id: `r${n}`, date, createdAt: `${date}T12:00:${String(n % 60).padStart(2, "0")}Z`, score, holesPlayed: 18, courseRating: 72, slopeRating: 113, holes: null, ...opts }
}

describe("recalculating the whole record", () => {
  it("caps at par + 5 until there's an index, net double bogey after", () => {
    const blowUp = card(4, { 1: 12 }) // 80 gross with a 12 on the hardest hole
    const rounds = [
      round("2026-01-01", 80, { holes: blowUp }),
      round("2026-01-02", 82),
      round("2026-01-03", 84),
      round("2026-01-04", 80, { holes: blowUp }),
    ]
    const { results, index } = recalculateRounds(rounds)
    expect(results[0]).toMatchObject({ adjustedScore: 77, scoreCap: "par_plus_5", differential: 5, indexUsed: null }) // 12 -> 9
    expect(results[1]).toMatchObject({ adjustedScore: null, scoreCap: "none", differential: 10 })
    // after 54 holes: index = lowest of 3 (5.0) - 2.0 = 3.0 -> Course Handicap 3 -> SI 1 gets a stroke: cap 7
    expect(results[3]).toMatchObject({ indexUsed: 3, scoreCap: "net_double_bogey", adjustedScore: 75, differential: 3 })
    expect(index).toBe(2) // 4 differentials (3.0, 10, 12, 5.0): lowest (3.0) - 1.0
  })

  it("9-hole rounds wait for an index, then are completed once 54 holes are posted", () => {
    const nine = (date: string, score: number) => round(date, score, { holesPlayed: 9, courseRating: 36, slopeRating: 113 })
    const rounds = ["2026-02-01", "2026-02-02", "2026-02-03", "2026-02-04", "2026-02-05"].map((d) => nine(d, 42))
    const before = recalculateRounds(rounds)
    expect(before.results.every((r) => r.status === "waiting_for_index" && r.differential == null)).toBe(true)
    expect(before.index).toBeNull() // 45 holes
    const after = recalculateRounds([...rounds, nine("2026-02-06", 42)])
    // 54 holes: provisional index from 9-hole differentials doubled (12.0 each; 6 -> avg lowest 2 - 1 = 11.0),
    // then each 9 = 6.0 + (0.52 x 11 + 1.2) = 6.0 + 6.92 = 12.9
    expect(after.results.every((r) => r.status === "rated" && r.differential === 12.9)).toBe(true)
    expect(after.index).toBe(11.9) // 6 differentials of 12.9: avg lowest 2 - 1.0
  })

  it("a hand-entered index stands in before the app has calculated one", () => {
    const r = recalculateRounds(
      [round("2026-03-02", 42, { holesPlayed: 9, courseRating: 33.8, slopeRating: 113 })],
      [{ date: "2026-03-01", index: 14 }]
    )
    expect(r.results[0]).toMatchObject({ status: "rated", differential: 16.7, indexUsed: 14 }) // 8.2 + 8.48 = 16.68 -> 16.7
  })

  it("rounds on the same day use the index from the start of that day", () => {
    const rounds = [round("2026-04-01", 80), round("2026-04-02", 80), round("2026-04-03", 80), round("2026-04-04", 70), round("2026-04-04", 90)]
    const { results } = recalculateRounds(rounds)
    expect(results[3].indexUsed).toBe(6) // three 8.0s: 8.0 - 2.0
    expect(results[4].indexUsed).toBe(6) // same day: not yet including the 70
  })
})

describe("needsNewCalculatedEntry", () => {
  it("records nothing until there is an index", () => {
    expect(needsNewCalculatedEntry(null, null)).toBe(false)
  })
  it("records the first index", () => {
    expect(needsNewCalculatedEntry(null, 4.2)).toBe(true)
  })
  it("skips a save that doesn't change the calculated index (numeric column comes back as a string)", () => {
    expect(needsNewCalculatedEntry({ source: "calculated", handicap_index: "4.2" }, 4.2)).toBe(false)
  })
  it("records a changed index", () => {
    expect(needsNewCalculatedEntry({ source: "calculated", handicap_index: 4.2 }, 3.9)).toBe(true)
  })
  it("a new calculation supersedes a manual entry, even at the same value", () => {
    expect(needsNewCalculatedEntry({ source: "manual", handicap_index: 3.5 }, 3.5)).toBe(true)
  })
})
