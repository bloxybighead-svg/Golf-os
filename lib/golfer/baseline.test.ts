import { describe, it, expect } from "vitest"
import { bagFor, cleanCarries, cleanHandicap } from "./baseline"

describe("cleanCarries", () => {
  it("keeps catalog clubs with plausible yardages, rounded", () => {
    expect(cleanCarries({ Driver: "251.6", "7-Iron": 155, Putter: 20, "4-Iron": "" })).toEqual({ Driver: 252, "7-Iron": 155 })
  })
  it("drops impossible numbers", () => {
    expect(cleanCarries({ Driver: 900, PW: 10, SW: "abc" })).toEqual({})
  })
})

describe("cleanHandicap", () => {
  it("accepts a best guess to one decimal, including plus handicaps", () => {
    expect(cleanHandicap("12.44")).toBe(12.4)
    expect(cleanHandicap(-2)).toBe(-2)
  })
  it("treats blank or silly values as unknown", () => {
    expect(cleanHandicap("")).toBeNull()
    expect(cleanHandicap("99")).toBeNull()
  })
})

describe("bagFor", () => {
  it("is the default bag when only driver and 7-iron are given", () => {
    expect(bagFor({ Driver: 250, "7-Iron": 150 })).toEqual(["Driver", "3-Wood", "5-Iron", "6-Iron", "7-Iron", "8-Iron", "9-Iron", "PW", "GW", "SW", "LW"])
  })
  it("adds any extra club they gave a carry for, in bag order", () => {
    expect(bagFor({ "5-Wood": 215, "4-Iron": 190 })).toEqual([
      "Driver", "3-Wood", "5-Wood", "4-Iron", "5-Iron", "6-Iron", "7-Iron", "8-Iron", "9-Iron", "PW", "GW", "SW", "LW",
    ])
  })
})
