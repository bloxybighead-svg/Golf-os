import { describe, expect, it } from "vitest"
import { OUTLIER_MEDIAN_RATIO, PARTIAL_P90_RATIO, clubCounts, keptShots, quantile, reviewShots } from "./review"
import type { ParsedShot } from "./types"

const shot = (carryYds: number, club: ParsedShot["club"] = "7-Iron", isPartial = false): ParsedShot => ({
  club,
  carryYds,
  offlineYds: 0,
  curveYds: null,
  launchDirDeg: null,
  isPartial,
})

describe("review flags", () => {
  const carries = [158, 160, 161, 162, 163, 164, 165, 166, 150, 85, 70]
  const review = reviewShots(carries.map((c) => shot(c)))
  const flagOf = (c: number) => review.find((r) => r.shot.carryYds === c)!

  it("flags carries under 60% of the club median as outliers, pre-excluded", () => {
    const sorted = [...carries].sort((a, b) => a - b)
    expect(OUTLIER_MEDIAN_RATIO * quantile(sorted, 0.5)).toBeCloseTo(96.6, 1)
    expect(flagOf(85)).toMatchObject({ flag: "outlier", excluded: true })
    expect(flagOf(70)).toMatchObject({ flag: "outlier", excluded: true })
  })
  it("flags shots under 85% of the P90 carry as likely partials (parse_sessions.py's rule)", () => {
    expect(PARTIAL_P90_RATIO).toBe(0.85)
    const r = reviewShots([...[150, 152, 153, 154, 155, 156, 157, 158, 159, 160].map((c) => shot(c)), shot(120)])
    expect(r.find((x) => x.shot.carryYds === 120)).toMatchObject({ flag: "partial", excluded: true })
    expect(r.find((x) => x.shot.carryYds === 150)).toMatchObject({ flag: null, excluded: false })
  })
  it("keeps normal shots and honours a partial column from the file", () => {
    expect(flagOf(160)).toMatchObject({ flag: null, excluded: false })
    const withFlag = reviewShots([shot(150), shot(151), shot(152, "7-Iron", true)])
    expect(withFlag[2]).toMatchObject({ flag: "partial", excluded: true })
  })
  it("counts shots per club in bag order and saves only what is not excluded, as full swings", () => {
    const rv = reviewShots([...carries.map((c) => shot(c)), shot(250, "Driver"), shot(252, "Driver")])
    rv[0].excluded = true // golfer ticks a good shot out
    const counts = clubCounts(rv)
    expect(counts.map((c) => c.club)).toEqual(["Driver", "7-Iron"])
    expect(counts[0]).toEqual({ club: "Driver", total: 2, kept: 2, flagged: 0 })
    expect(counts[1].total).toBe(11)
    expect(counts[1].kept).toBe(11 - rv.filter((r) => r.excluded && r.shot.club === "7-Iron").length)
    rv.find((r) => r.shot.carryYds === 85)!.excluded = false // golfer keeps a flagged one
    expect(keptShots(rv).find((s) => s.carryYds === 85)?.isPartial).toBe(false)
    expect(keptShots(rv).some((s) => s.carryYds === 70)).toBe(false)
  })
})
