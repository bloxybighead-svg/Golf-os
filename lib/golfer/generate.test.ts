import { describe, it, expect } from "vitest"
import { generateCustomGolferShots } from "./build"
import { computeDispersionStats } from "@/lib/dispersion/stats"

describe("generateCustomGolferShots", () => {
  it("realizes the mean carry a user enters, for a big-enough sample", () => {
    const shots = generateCustomGolferShots(
      { handicapIndex: 8, knownCarries: { Driver: 260 } },
      4000,
      1,
      ["Driver"]
    )
    const stats = computeDispersionStats(shots.map((s) => ({ carryYds: s.carryYds, offlineYds: s.offlineYds })))
    expect(stats.carryMean).toBeGreaterThan(255)
    expect(stats.carryMean).toBeLessThan(265)
  })

  it("produces tighter dispersion for a low handicap than a high one", () => {
    const scratch = generateCustomGolferShots({ handicapIndex: 0 }, 3000, 2, ["Driver"])
    const highHcp = generateCustomGolferShots({ handicapIndex: 22 }, 3000, 2, ["Driver"])
    const scratchStats = computeDispersionStats(scratch.map((s) => ({ carryYds: s.carryYds, offlineYds: s.offlineYds })))
    const highStats = computeDispersionStats(highHcp.map((s) => ({ carryYds: s.carryYds, offlineYds: s.offlineYds })))
    expect(scratchStats.offlineSd).toBeLessThan(highStats.offlineSd)
  })

  it("never produces a negative or absurdly long carry", () => {
    const shots = generateCustomGolferShots({ handicapIndex: 15 }, 3000, 3, ["Driver"])
    for (const s of shots) {
      expect(s.carryYds).toBeGreaterThanOrEqual(0)
      expect(s.carryYds).toBeLessThan(400)
    }
  })

  it("is deterministic for a given seed", () => {
    const a = generateCustomGolferShots({ handicapIndex: 10 }, 100, 42, ["7-Iron"])
    const b = generateCustomGolferShots({ handicapIndex: 10 }, 100, 42, ["7-Iron"])
    expect(a).toEqual(b)
  })

  it("respects a restricted club list", () => {
    const shots = generateCustomGolferShots({ handicapIndex: 10 }, 200, 5, ["PW"])
    expect(shots.every((s) => s.club === "PW")).toBe(true)
  })

  it("the floor taper doesn't produce a hard pile-up (no dominant single output value)", () => {
    const shots = generateCustomGolferShots({ handicapIndex: 5 }, 5000, 6, ["Driver"])
    const counts = new Map<number, number>()
    for (const s of shots) counts.set(s.carryYds, (counts.get(s.carryYds) ?? 0) + 1)
    const maxCount = Math.max(...Array.from(counts.values()))
    // no single rounded carry value should account for more than ~2% of shots
    expect(maxCount / shots.length).toBeLessThan(0.02)
  })
})
