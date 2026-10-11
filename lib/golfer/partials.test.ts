import { describe, expect, it } from "vitest"
import { fromLocal } from "@/lib/course/geo"
import { buildLieMap } from "@/lib/course/lies"
import { rankClubsOptimized, type ClubShots } from "@/lib/course/plan"
import { seededRng } from "@/lib/dispersion/stats"
import {
  PARTIAL_CARRY_RATIO,
  PARTIAL_SPREAD_SCALE,
  cleanWedgeCarries,
  clubsForDistance,
  derivePartial,
  parsePartial,
  withPartials,
} from "./partials"

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)))

function pattern(carry: number, carrySpread: number, offSpread: number, seed: number, n = 400) {
  const r = seededRng(seed)
  return Array.from({ length: n }, () => ({ carryYds: carry + (r() - 0.5) * 2 * carrySpread, offlineYds: (r() - 0.5) * 2 * offSpread }))
}

describe("derived partial shots", () => {
  const full = pattern(100, 6, 8, 1)

  it("carry and offline follow the 0.85 and 0.65 ratios, and the carry spread is 0.8 of that", () => {
    for (const length of ["3/4", "1/2"] as const) {
      const ratio = PARTIAL_CARRY_RATIO[length]
      const p = derivePartial(full, length)
      expect(mean(p.map((s) => s.carryYds))).toBeCloseTo(mean(full.map((s) => s.carryYds)) * ratio, 8)
      expect(sd(p.map((s) => s.carryYds))).toBeCloseTo(sd(full.map((s) => s.carryYds)) * ratio * PARTIAL_SPREAD_SCALE, 8)
      expect(sd(p.map((s) => s.offlineYds))).toBeCloseTo(sd(full.map((s) => s.offlineYds)) * ratio, 8)
    }
    expect(PARTIAL_CARRY_RATIO).toEqual({ "3/4": 0.85, "1/2": 0.65 })
  })

  it("a typed carry replaces the mean and keeps the derived spread", () => {
    const derived = derivePartial(full, "3/4")
    const typed = derivePartial(full, "3/4", 92)
    expect(mean(typed.map((s) => s.carryYds))).toBeCloseTo(92, 8)
    expect(sd(typed.map((s) => s.carryYds))).toBeCloseTo(sd(derived.map((s) => s.carryYds)), 8)
  })

  it("adds a 3/4 and a 1/2 for each full wedge in the bag, named like \"GW 3/4\"", () => {
    const bag = withPartials(
      [{ club: "7-Iron", shots: full }, { club: "GW", shots: full }],
      { "GW 1/2": 55 }
    )
    expect(bag.map((c) => c.club)).toEqual(["7-Iron", "GW", "GW 3/4", "GW 1/2"])
    expect(mean(bag[3].shots.map((s) => s.carryYds))).toBeCloseTo(55, 8)
    expect(parsePartial("GW 3/4")).toEqual({ club: "GW", length: "3/4" })
    expect(parsePartial("7-Iron")).toBeNull()
  })

  it("keeps only sensible typed carries", () => {
    expect(cleanWedgeCarries({ "SW 3/4": "80", "SW 1/2": 3, "LW 1/2": 500, Nonsense: 60 })).toEqual({ "SW 3/4": 80 })
    expect(cleanWedgeCarries(null)).toEqual({})
  })
})

describe("ranking with partials", () => {
  const origin = { lat: 36.5685, lng: -121.949 }
  const at = (x: number, y: number) => fromLocal(origin, { x, y })
  const rect = (x0: number, y0: number, x1: number, y1: number) => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]
  const lies = buildLieMap(origin, [{ kind: "fairway", ring: rect(-60, -20, 60, 200) }])
  const bag = withPartials(
    [
      { club: "PW", shots: pattern(120, 5, 6, 2) },
      { club: "SW", shots: pattern(100, 5, 6, 3) },
    ],
    {}
  ) as ClubShots[]
  const rankFrom = (yds: number, clubs = bag) => {
    const pin = at(0, yds)
    return rankClubsOptimized(clubs, { from: origin, aim: pin, pin, lies, startLie: "fairway" }, { line: null })
  }

  it("from 85 yd with a 100-yd full SW, the best option is a partial", () => {
    const ranked = rankFrom(85)
    expect(ranked.map((r) => r.club)).toContain("SW 3/4")
    expect(parsePartial(ranked[0].club)).not.toBeNull()
  })

  it("from 160 yd no partial is ranked", () => {
    const ranked = rankFrom(160)
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked.every((r) => parsePartial(r.club) === null)).toBe(true)
  })

  it("partials stay in range up to the full PW's carry plus 10 yd", () => {
    expect(clubsForDistance(bag, 129).some((c) => parsePartial(c.club))).toBe(true)
    expect(clubsForDistance(bag, 131).some((c) => parsePartial(c.club))).toBe(false)
  })
})
