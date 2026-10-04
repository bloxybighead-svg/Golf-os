import { describe, expect, it } from "vitest"
import { buildBagRows, drillsThisWeek, formatIndex, practiceValue, safeReturnPath, statsValue } from "./hub"

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

describe("buildBagRows", () => {
  it("badges fitted clubs with 13c's thresholds and uses typed carries otherwise", () => {
    const rows = buildBagRows({
      bag: ["Driver", "7-Iron", "PW", "SW"],
      carries: { "7-Iron": 150 },
      fitted: [
        { club: "Driver", meanCarryYds: 264.4, nShots: 150 }, // >= 140: Solid
        { club: "PW", meanCarryYds: 120, nShots: 8 }, // < 15: Thin
        { club: "SW", meanCarryYds: 90, nShots: 20 }, // 15..34: OK
      ],
    })
    expect(rows[0]).toEqual({ club: "Driver", carryYds: 264, badge: "solid", nShots: 150 })
    expect(rows[1]).toEqual({ club: "7-Iron", carryYds: 150, badge: null, nShots: null })
    expect(rows[2].badge).toBe("thin")
    expect(rows[3].badge).toBe("ok")
  })
  it("has no badges and no carry for a golfer with no data", () => {
    const rows = buildBagRows({ bag: ["PW"], carries: {}, fitted: null })
    expect(rows[0]).toEqual({ club: "PW", carryYds: null, badge: null, nShots: null })
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
