import { describe, expect, it } from "vitest"
import { parseScorecard, teeFill } from "./scorecard"

// Trimmed from a real OpenGolfAPI response (Pebble Beach, logged 2026-10-01).
const PEBBLE = {
  tees: [
    { tee_key: "gold-male", tee_name: "Gold", tee_color: "gold", gender: "Male", course_rating: 73.4, slope: 137, par: 72, yardage: 6472 },
    { tee_key: "gold-female", tee_name: "Gold", tee_color: "gold", gender: "Female", course_rating: 78.2, slope: 146, par: 72, yardage: 6472 },
    { tee_key: "broken", tee_name: "Broken", course_rating: null, slope: 137, par: 72 },
  ],
  holes_data: [
    { number: 2, par: 5, handicap_index: 10 },
    { number: 1, par: 4, handicap_index: 6 },
    { number: 3, par: 4, handicap_index: null },
  ],
}

describe("course scorecard from OpenGolfAPI", () => {
  it("reads each tee's rating, slope and par (men's and women's separately) and skips unusable ones", () => {
    const sc = parseScorecard(PEBBLE)
    expect(sc.tees).toEqual([
      { label: "Gold (Male)", courseRating: 73.4, slopeRating: 137, par: 72, yardage: 6472 },
      { label: "Gold (Female)", courseRating: 78.2, slopeRating: 146, par: 72, yardage: 6472 },
    ])
  })

  it("reads each hole's par and stroke index, in hole order", () => {
    expect(parseScorecard(PEBBLE).holes).toEqual([
      { number: 1, par: 4, strokeIndex: 6 },
      { number: 2, par: 5, strokeIndex: 10 },
      { number: 3, par: 4, strokeIndex: null },
    ])
  })

  it("fills 18 holes as is, and 9 holes with half the rating and par (no 9-hole ratings in the data)", () => {
    const gold = parseScorecard(PEBBLE).tees[0]
    expect(teeFill(gold, 18)).toEqual({ courseRating: 73.4, slopeRating: 137, par: 72 })
    expect(teeFill(gold, 9)).toEqual({ courseRating: 36.7, slopeRating: 137, par: 36 })
  })

  it("copes with an empty or odd response", () => {
    expect(parseScorecard(null)).toEqual({ tees: [], holes: [] })
    expect(parseScorecard({ tees: "nope" })).toEqual({ tees: [], holes: [] })
  })
})
