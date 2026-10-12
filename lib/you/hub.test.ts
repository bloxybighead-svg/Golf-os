import { describe, expect, it } from "vitest"
import { drillsThisWeek, formatIndex, practiceValue, safeReturnPath, statsValue } from "./hub"

const NOW = new Date("2026-10-04T12:00:00Z").getTime()
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString()

describe("hub values", () => {
  it("formats the index like a golfer", () => {
    expect(formatIndex(2.4)).toBe("2.4")
    expect(formatIndex(-1.2)).toBe("+1.2")
    expect(statsValue(2.4)).toBe("2.4 index")
    expect(statsValue(null)).toBeNull()
  })

  it("counts only drills finished in the last 7 days", () => {
    const runs = [
      { completed_at: daysAgo(1) },
      { completed_at: daysAgo(6.9) },
      { completed_at: daysAgo(8) },
      { completed_at: null },
      { completed_at: new Date(NOW + 3600000).toISOString() }, // clock skew: not counted
    ]
    expect(drillsThisWeek(runs, NOW)).toBe(2)
  })

  it("words the practice row", () => {
    expect(practiceValue(0)).toBeNull()
    expect(practiceValue(1)).toBe("1 drill this week")
    expect(practiceValue(3)).toBe("3 drills this week")
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
