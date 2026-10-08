import { describe, it, expect } from "vitest"
import { courseHandicap, recommendedCourseYardage, recommendTee, type TeeOption } from "./estimate"

describe("courseHandicap", () => {
  it("equals the Handicap Index when slope is neutral (113) and rating equals par", () => {
    expect(courseHandicap(10, 113, 72, 72)).toBe(10)
  })

  it("matches a hand-worked example from a harder tee", () => {
    // 10 * (130/113) + (74-72) = 11.504 + 2 = 13.504 -> rounds to 14
    expect(courseHandicap(10, 130, 74, 72)).toBe(14)
  })

  it("goes down on an easier tee (lower slope/rating)", () => {
    const easier = courseHandicap(15, 105, 68, 72)
    const harder = courseHandicap(15, 135, 76, 72)
    expect(easier).toBeLessThan(harder)
  })
})

describe("recommendedCourseYardage", () => {
  it("scales linearly with driver carry", () => {
    expect(recommendedCourseYardage(200)).toBe(200 * 25)
    expect(recommendedCourseYardage(264)).toBe(264 * 25)
  })
})

describe("recommendTee", () => {
  const tees: TeeOption[] = [
    { name: "Black", totalYardage: 7100, courseRating: 74.2, slopeRating: 138, par: 72 },
    { name: "Blue", totalYardage: 6600, courseRating: 71.8, slopeRating: 130, par: 72 },
    { name: "White", totalYardage: 6100, courseRating: 69.5, slopeRating: 124, par: 72 },
    { name: "Gold", totalYardage: 5400, courseRating: 66.0, slopeRating: 115, par: 72 },
  ]

  it("recommends the longest tee that doesn't exceed the golfer's recommended yardage", () => {
    // the author's real calibrated Driver mean carry (264.1) -> recommended ~6600
    const result = recommendTee({ handicapIndex: 2, driverCarryYds: 264.1 }, tees)
    expect(result.recommended.tee.name).toBe("Blue")
  })

  it("falls back to the shortest tee if every tee is longer than recommended", () => {
    const result = recommendTee({ handicapIndex: 20, driverCarryYds: 180 }, tees)
    // recommended yardage = 4500, every tee here is longer than that
    expect(result.recommended.tee.name).toBe("Gold")
  })

  it("computes a course handicap for every tee, not just the recommended one", () => {
    const result = recommendTee({ handicapIndex: 8, driverCarryYds: 230 }, tees)
    expect(result.all).toHaveLength(tees.length)
    expect(result.all.every((t) => Number.isFinite(t.courseHandicap))).toBe(true)
  })

  it("throws on an empty tee list rather than silently picking nothing", () => {
    expect(() => recommendTee({ handicapIndex: 10, driverCarryYds: 250 }, [])).toThrow()
  })
})
