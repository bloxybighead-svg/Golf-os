import { describe, it, expect } from "vitest"
import { computeDispersionStats, seededSample } from "./stats"

describe("computeDispersionStats", () => {
  it("computes mean/sd correctly on a known small set", () => {
    const shots = [
      { carryYds: 100, offlineYds: 0 },
      { carryYds: 110, offlineYds: 10 },
      { carryYds: 90, offlineYds: -10 },
    ]
    const stats = computeDispersionStats(shots)
    expect(stats.n).toBe(3)
    expect(stats.carryMean).toBeCloseTo(100, 6)
    expect(stats.offlineMean).toBeCloseTo(0, 6)
    // sample sd of [90,100,110] = 10
    expect(stats.carrySd).toBeCloseTo(10, 6)
  })

  it("median (p50) matches the middle value for an odd-length sorted set", () => {
    const shots = [10, 20, 30, 40, 50].map((c) => ({ carryYds: c, offlineYds: 0 }))
    expect(computeDispersionStats(shots).carryP50).toBe(30)
  })
})

describe("seededSample", () => {
  it("returns exactly n items, all drawn from the original set", () => {
    const items = Array.from({ length: 100 }, (_, i) => i)
    const sample = seededSample(items, 20, 42)
    expect(sample).toHaveLength(20)
    for (const v of sample) expect(items).toContain(v)
  })

  it("is deterministic for a given seed", () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    expect(seededSample(items, 10, 7)).toEqual(seededSample(items, 10, 7))
  })

  it("caps at the input length if n exceeds it", () => {
    const items = [1, 2, 3]
    expect(seededSample(items, 10, 1)).toHaveLength(3)
  })
})
