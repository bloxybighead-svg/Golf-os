import { describe, expect, it } from "vitest"
import { normalizeClubName } from "./clubNames"

describe("normalizeClubName", () => {
  it.each([
    ["7i", "7-Iron"], ["7 Iron", "7-Iron"], ["7-iron", "7-Iron"], ["7-Iron", "7-Iron"], ["Iron 7", "7-Iron"], ["7I", "7-Iron"], ["  4 iron ", "4-Iron"],
    ["Dr", "Driver"], ["Driver", "Driver"], ["1W", "Driver"], ["1 Wood", "Driver"],
    ["3w", "3-Wood"], ["3 Wood", "3-Wood"], ["5-wood", "5-Wood"], ["7W", "7-Wood"], ["Wood 3", "3-Wood"],
    ["PW", "PW"], ["Pitching Wedge", "PW"], ["pw", "PW"],
    ["GW", "GW"], ["AW", "GW"], ["Gap Wedge", "GW"], ["Approach Wedge", "GW"],
    ["SW", "SW"], ["Sand Wedge", "SW"], ["56 (SW)", "SW"], ["56", "SW"], ["56°", "SW"], ["58", "SW"],
    ["LW", "LW"], ["Lob Wedge", "LW"], ["60 (LW)", "LW"], ["60", "LW"], ["60 deg", "LW"],
    ["52", "GW"], ["48", "PW"],
  ])("%s -> %s", (raw, club) => {
    expect(normalizeClubName(raw)).toBe(club)
  })

  it.each(["", "Average", "Putter", "3H", "Hybrid", "2i", "10i", "12", "99", "Dillon"])("%j is not a catalog club", (raw) => {
    expect(normalizeClubName(raw)).toBeNull()
  })
})
