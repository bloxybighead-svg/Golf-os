import { describe, it, expect } from "vitest"
import { neighbourTees, teeOptionsFrom, type OpenGolfApiTee } from "./tees"
import { recommendTee } from "./estimate"

// Pebble Beach as OpenGolfAPI returns it (men's and women's ratings per tee).
const PEBBLE: OpenGolfApiTee[] = [
  { tee_name: "Blue", gender: "Male", yardage: 6802, course_rating: 74.9, slope: 144, par: 72 },
  { tee_name: "Gold", gender: "Male", yardage: 6472, course_rating: 73.4, slope: 137, par: 72 },
  { tee_name: "Gold", gender: "Female", yardage: 6472, course_rating: 78.2, slope: 146, par: 72 },
  { tee_name: "White", gender: "Male", yardage: 6083, course_rating: 71.7, slope: 135, par: 72 },
  { tee_name: "White", gender: "Female", yardage: 6083, course_rating: 76.2, slope: 139, par: 72 },
  { tee_name: "Green", gender: "Male", yardage: 5547, course_rating: 68.7, slope: 126, par: 72 },
  { tee_name: "Red", gender: "Male", yardage: 5125, course_rating: 67.3, slope: 124, par: 72 },
  { tee_name: "Red", gender: "Female", yardage: 5125, course_rating: 71.7, slope: 132, par: 72 },
]

describe("teeOptionsFrom", () => {
  it("keeps one entry per tee with the men's ratings, longest first", () => {
    const tees = teeOptionsFrom(PEBBLE)
    expect(tees.map((t) => t.name)).toEqual(["Blue", "Gold", "White", "Green", "Red"])
    expect(tees.find((t) => t.name === "Gold")!.courseRating).toBe(73.4)
  })

  it("falls back to whatever ratings exist when there are no men's", () => {
    const tees = teeOptionsFrom([{ tee_name: "Red", gender: "Female", yardage: 5682, course_rating: 72.8, slope: 124, par: 74 }])
    expect(tees).toHaveLength(1)
  })

  it("drops tees with missing numbers", () => {
    expect(teeOptionsFrom([{ tee_name: "X", gender: "Male", yardage: 0, course_rating: 70, slope: 120, par: 72 }])).toEqual([])
  })
})

describe("neighbourTees", () => {
  const tees = teeOptionsFrom(PEBBLE)
  it("returns the next longer and shorter tee", () => {
    const n = neighbourTees(tees, "White")
    expect(n.longer?.name).toBe("Gold")
    expect(n.shorter?.name).toBe("Green")
  })
  it("has nothing past either end", () => {
    expect(neighbourTees(tees, "Blue").longer).toBeNull()
    expect(neighbourTees(tees, "Red").shorter).toBeNull()
  })
})

describe("recommendation on real tees", () => {
  it("a 264-yd driver (the author's) is steered to the longest tee within reach", () => {
    // 264 x 25 = 6600 yd recommended: Gold (6472) is the longest tee not over it.
    expect(recommendTee({ handicapIndex: 3.5, driverCarryYds: 264 }, teeOptionsFrom(PEBBLE)).recommended.tee.name).toBe("Gold")
  })
})
