import { describe, it, expect } from "vitest"
import { pointInPolygon, makeFairwayPolygon } from "./polygon"

describe("pointInPolygon", () => {
  // simple 100x100 yard square, corners at (0,0) (100,0) (100,100) (0,100)
  const square = [
    { offlineYds: 0, carryYds: 0 },
    { offlineYds: 100, carryYds: 0 },
    { offlineYds: 100, carryYds: 100 },
    { offlineYds: 0, carryYds: 100 },
  ]

  it("returns true for a point clearly inside", () => {
    expect(pointInPolygon({ offlineYds: 50, carryYds: 50 }, square)).toBe(true)
  })

  it("returns false for a point clearly outside", () => {
    expect(pointInPolygon({ offlineYds: 150, carryYds: 50 }, square)).toBe(false)
    expect(pointInPolygon({ offlineYds: 50, carryYds: -10 }, square)).toBe(false)
  })

  it("returns false for a point just past the edge", () => {
    expect(pointInPolygon({ offlineYds: 100.5, carryYds: 50 }, square)).toBe(false)
  })
})

describe("makeFairwayPolygon", () => {
  it("builds a trapezoid centered on 0 by default", () => {
    const fairway = makeFairwayPolygon({ startYds: 0, endYds: 250, startWidthYds: 20, endWidthYds: 40 })
    // at the tee end, the fairway should span -10..10
    const nearTee = fairway.filter((p) => p.carryYds === 0)
    expect(nearTee.map((p) => p.offlineYds).sort((a, b) => a - b)).toEqual([-10, 10])
  })

  it("a shot down the middle at any distance lands inside", () => {
    const fairway = makeFairwayPolygon({ startYds: 0, endYds: 250, startWidthYds: 20, endWidthYds: 40 })
    expect(pointInPolygon({ offlineYds: 0, carryYds: 125 }, fairway)).toBe(true)
  })

  it("a wild slice well outside the widening fairway lands outside", () => {
    const fairway = makeFairwayPolygon({ startYds: 0, endYds: 250, startWidthYds: 20, endWidthYds: 40 })
    expect(pointInPolygon({ offlineYds: 60, carryYds: 125 }, fairway)).toBe(false)
  })

  it("respects a center offset (dogleg stand-in)", () => {
    const fairway = makeFairwayPolygon({
      startYds: 0, endYds: 250, startWidthYds: 20, endWidthYds: 40, centerOffsetYds: 15,
    })
    expect(pointInPolygon({ offlineYds: 15, carryYds: 125 }, fairway)).toBe(true)
    expect(pointInPolygon({ offlineYds: -15, carryYds: 125 }, fairway)).toBe(false)
  })
})

describe("QA: real Driver dispersion against a realistic fairway", () => {
  // Deterministic seeded sampler (mulberry32) so this test is reproducible
  // without depending on live Supabase data. Parameters below are the author's
  // real calibrated Driver stats from club_dispersion: mean 264.1 carry,
  // sd 11.3; offline mean -1.7 (median), sd 27.7 -- see
  // supabase/simulated_shots_queries.sql query #1 output.
  function mulberry32(seed: number) {
    return function () {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  function randNormal(rng: () => number, mean: number, sd: number): number {
    const u1 = rng() || 1e-9
    const u2 = rng()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    return mean + z * sd
  }

  it("a realistic fraction of sampled Driver shots land inside a 40yd-wide fairway", () => {
    const rng = mulberry32(42)
    const fairway = makeFairwayPolygon({ startYds: 200, endYds: 300, startWidthYds: 40, endWidthYds: 40 })
    const n = 2000
    let insideCount = 0
    for (let i = 0; i < n; i++) {
      const carryYds = randNormal(rng, 264.1, 11.3)
      const offlineYds = randNormal(rng, -1.7, 27.7)
      if (pointInPolygon({ carryYds, offlineYds }, fairway)) insideCount++
    }
    const pct = insideCount / n
    // Sanity band, not a precise assertion: a real fairway-hit rate for a
    // driver with this much lateral spread should be well short of 100%
    // and well above 0 -- this is the actual "did our sampled points end
    // up inside the polygon" check the model needs to pass.
    expect(pct).toBeGreaterThan(0.2)
    expect(pct).toBeLessThan(0.8)
  })
})
