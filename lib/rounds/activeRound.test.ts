import { describe, it, expect } from "vitest"
import { describeOrder, holesFor, nextUnscored, playOrder, ratingForHoles, type ActiveRound } from "./activeRound"

describe("playOrder", () => {
  it("plays 18 from the first", () => {
    expect(playOrder(1, 18)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
  })
  it("knows a back nine: 9 holes starting on 10", () => {
    expect(playOrder(10, 9)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
  })
  it("wraps past 18 for other counts", () => {
    expect(playOrder(10, 12)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3])
    expect(playOrder(17, 4)).toEqual([17, 18, 1, 2])
  })
  it("never repeats a hole on a 9-hole course", () => {
    expect(playOrder(5, 18, 9)).toEqual([5, 6, 7, 8, 9, 1, 2, 3, 4])
  })
})

describe("describeOrder", () => {
  it("names the stretch of holes, split where it wraps", () => {
    expect(describeOrder(playOrder(10, 9))).toBe("10–18")
    expect(describeOrder(playOrder(10, 12))).toBe("10–18, 1–3")
    expect(describeOrder([7])).toBe("7")
  })
})

describe("holesFor", () => {
  it("takes pars from the course and falls back to 4", () => {
    const holes = holesFor([10, 11, 12], { 10: 5, 11: 3, 12: null })
    expect(holes.map((h) => [h.hole_number, h.par])).toEqual([[10, 5], [11, 3], [12, 4]])
    expect(holes.every((h) => h.strokes == null)).toBe(true)
  })
})

describe("ratingForHoles", () => {
  it("is the tee's rating for 18 and its share for fewer", () => {
    expect(ratingForHoles(73.4, 18)).toBe(73.4)
    expect(ratingForHoles(73.4, 9)).toBe(36.7)
    expect(ratingForHoles(72, 12)).toBe(48)
  })
})

describe("nextUnscored", () => {
  it("is the first hole in play order without a score", () => {
    const holes = holesFor(playOrder(10, 3))
    holes[0].strokes = 4
    const round = { holes } as ActiveRound
    expect(nextUnscored(round)).toBe(11)
    holes[1].strokes = 5
    holes[2].strokes = 3
    expect(nextUnscored(round)).toBeNull()
  })
})
