import { describe, expect, it } from "vitest"
import {
  getBaseline,
  REFERENCE_ROUND,
  SCRATCH_VS_TOUR_STROKES,
  TOUR_BASELINE,
  TWO_PUTT_FT,
  GOLFER90_HANDICAP,
  readCompareAgainst,
} from "./baseline"
import { expectedFromStart, expectedStrokesRemaining, tourExpected } from "./cost"
import type { Lie } from "./lies"
import { fromLocal } from "./geo"
import { buildLieMap } from "./lies"
import { evaluateClub, rankClubsOptimized } from "./plan"
import { createRankHandler } from "./rankRequest"

const roundFromTees = (h: number | null, holes: readonly { yds: number }[]) =>
  holes.reduce((s, hole) => s + getBaseline(h).expectedFromStart("tee", hole.yds), 0)

// A second par-72, 6,500 yd layout with a spread of hole lengths, not the one the offset is sized on.
const OTHER_ROUND = [
  ...[140, 165, 185, 200].map((yds) => ({ par: 3, yds })),
  ...[320, 340, 355, 365, 375, 385, 395, 400, 410, 420].map((yds) => ({ par: 4, yds })),
  ...[480, 505, 520, 540].map((yds) => ({ par: 5, yds })),
]

describe("handicap baseline calibration", () => {
  it("a par-72, 6,500 yd round from the tees adds up to about 72 + handicap", () => {
    expect(REFERENCE_ROUND.reduce((s, h) => s + h.yds, 0)).toBe(6500)
    expect(OTHER_ROUND.reduce((s, h) => s + h.yds, 0)).toBe(6500)
    expect(OTHER_ROUND.reduce((s, h) => s + h.par, 0)).toBe(72)
    for (const h of [0, 5, 10, 20]) {
      // Honest note: this holds by construction. The extra strokes are sized on the reference round
      // and are linear in distance, so any 18-hole, 6,500 yd layout gets the same total extra; the
      // other layout only checks that the tour part doesn't swing much with the mix of hole lengths.
      expect(Math.abs(roundFromTees(h, REFERENCE_ROUND) - (72 + h))).toBeLessThanOrEqual(1.5)
      expect(Math.abs(roundFromTees(h, OTHER_ROUND) - (72 + h))).toBeLessThanOrEqual(1.5)
    }
  })

  it("a scratch golfer loses a couple of strokes a round to the tour, not zero and not ten", () => {
    expect(SCRATCH_VS_TOUR_STROKES).toBeGreaterThan(1)
    expect(SCRATCH_VS_TOUR_STROKES).toBeLessThan(4)
  })

  it("never gives a higher handicap fewer expected strokes from the same spot", () => {
    const lies: Lie[] = ["green", "fairway", "rough", "bunker", "trees", "water", "oob"]
    for (let h = 0; h < 30; h += 1) {
      const a = getBaseline(h)
      const b = getBaseline(h + 1)
      for (let d = 1; d <= 600; d += 7) {
        for (const lie of lies) {
          const origin = { distYds: d + 150, lie: "tee" as const }
          expect(b.expectedStrokesRemaining(lie, d, origin)).toBeGreaterThanOrEqual(a.expectedStrokesRemaining(lie, d, origin))
        }
        expect(b.expectedFromStart("tee", d)).toBeGreaterThanOrEqual(a.expectedFromStart("tee", d))
      }
    }
  })

  it("keeps fairway < rough < sand and rough < trees at every distance", () => {
    for (const h of [0, 5, 10, 20]) {
      const b = getBaseline(h)
      for (let d = 10; d <= 600; d += 5) {
        const fw = b.expectedStrokesRemaining("fairway", d)
        const rough = b.expectedStrokesRemaining("rough", d)
        expect(fw).toBeLessThan(rough)
        expect(rough).toBeLessThan(b.expectedStrokesRemaining("bunker", d))
        expect(rough).toBeLessThan(b.expectedStrokesRemaining("trees", d))
      }
    }
  })
})

describe("cited anchors", () => {
  it("a 90-golfer (~16 handicap) averages two putts from about 19 ft, like a pro from 33", () => {
    expect(GOLFER90_HANDICAP).toBe(16)
    const b = getBaseline(16)
    expect(b.expectedStrokesRemaining("green", TWO_PUTT_FT.golfer90 / 3)).toBeCloseTo(TOUR_BASELINE.expectedStrokesRemaining("green", TWO_PUTT_FT.tour / 3), 5)
    expect(b.expectedStrokesRemaining("green", TWO_PUTT_FT.golfer90 / 3)).toBeCloseTo(2.0, 1)
  })
})

describe("tour mode", () => {
  it("is exactly the current cost.ts numbers", () => {
    expect(getBaseline(null)).toBe(TOUR_BASELINE)
    const lies: Lie[] = ["green", "fairway", "rough", "bunker", "trees", "water", "oob"]
    for (let d = 1; d <= 650; d += 3) {
      for (const lie of lies) {
        const origin = { distYds: 380, lie: "tee" as const }
        expect(TOUR_BASELINE.expectedStrokesRemaining(lie, d, origin, d / 2)).toBe(expectedStrokesRemaining(lie, d, origin, d / 2))
      }
      expect(TOUR_BASELINE.expectedFromStart("tee", d)).toBe(expectedFromStart("tee", d))
      expect(TOUR_BASELINE.fairway(d)).toBe(tourExpected("fairway", d))
    }
  })

  it("scores the planner exactly as before when no baseline is given", () => {
    const O = { lat: 36.5685, lng: -121.949 }
    const at = (x: number, y: number) => fromLocal(O, { x, y })
    const lies = buildLieMap(O, [{ kind: "green", ring: [at(-15, 135), at(15, 135), at(15, 165), at(-15, 165)] }])
    const shots = Array.from({ length: 200 }, (_, i) => ({ carryYds: 140 + (i % 21), offlineYds: (i % 17) - 8 }))
    const ctx = { from: O, aim: at(0, 150), pin: at(0, 150), lies }
    expect(evaluateClub({ club: "7-Iron", shots }, { ...ctx, baseline: TOUR_BASELINE })).toEqual(evaluateClub({ club: "7-Iron", shots }, ctx))
  })
})

describe("handicap vs tour", () => {
  it("for a 10 handicap, missing into the rough at 150 yd costs more than it does a tour pro", () => {
    const ten = getBaseline(10)
    const tenPenalty = ten.expectedStrokesRemaining("rough", 150) - ten.expectedStrokesRemaining("fairway", 150)
    const tourPenalty = tourExpected("rough", 150) - tourExpected("fairway", 150)
    expect(tenPenalty).toBeGreaterThan(tourPenalty)
    expect(ten.expectedStrokesRemaining("fairway", 150)).toBeGreaterThan(tourExpected("fairway", 150))
  })

  it("flows through the ranking worker's handler", () => {
    const O = { lat: 36.5685, lng: -121.949 }
    const at = (x: number, y: number) => fromLocal(O, { x, y })
    const inputs = { origin: O, features: [{ kind: "green" as const, ring: [at(-15, 135), at(15, 135), at(15, 165), at(-15, 165)] }], coast: [], zones: [], extras: {} }
    const clubs = [{ club: "7-Iron", shots: Array.from({ length: 100 }, (_, i) => ({ carryYds: 140 + (i % 21), offlineYds: (i % 17) - 8 })) }]
    const handle = createRankHandler()
    handle({ type: "lies", version: 1, inputs })
    handle({ type: "bag", version: 1, clubs })
    const pin = at(0, 150)
    const req = { type: "rank" as const, id: 1, liesVersion: 1, bagVersion: 1, from: O, aim: pin, pin, startLie: "fairway" as const, line: null }
    const tour = handle({ ...req, handicap: null })!.results!
    const ten = handle({ ...req, id: 2, handicap: 10 })!.results!
    const lies = buildLieMap(O, inputs.features)
    expect(ten).toEqual(rankClubsOptimized(clubs, { from: O, aim: pin, pin, lies, startLie: "fairway", baseline: getBaseline(10) }, { line: null }))
    expect(ten[0].plan.expectedStrokes).toBeGreaterThan(tour[0].plan.expectedStrokes)
  })

  it("defaults to the handicap baseline when nothing is saved", () => {
    expect(readCompareAgainst()).toBe("handicap") // no localStorage in tests -> the default
  })
})
