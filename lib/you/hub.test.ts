import { describe, expect, it } from "vitest"
import { formatIndex, safeReturnPath, statsValue } from "./hub"

describe("hub values", () => {
  it("formats the index like a golfer", () => {
    expect(formatIndex(2.4)).toBe("2.4")
    expect(formatIndex(-1.2)).toBe("+1.2")
    expect(statsValue(2.4)).toBe("2.4 index")
    expect(statsValue(null)).toBeNull()
  })
})

describe("safeReturnPath", () => {
  it("allows in-app paths only", () => {
    expect(safeReturnPath("/you/bag")).toBe("/you/bag")
    expect(safeReturnPath("https://evil.example")).toBe("/you/bag")
    expect(safeReturnPath("//evil.example")).toBe("/you/bag")
    expect(safeReturnPath("/\\evil")).toBe("/you/bag")
    expect(safeReturnPath(null)).toBe("/you/bag")
  })
})
