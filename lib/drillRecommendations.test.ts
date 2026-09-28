import { describe, it, expect } from "vitest"
import { weakestCategory, recommendDrills } from "./drillRecommendations"
import type { CategoryTrend } from "./sgBenchmarks"

const trend = (category: CategoryTrend["category"], avgDeltaSg: number): CategoryTrend => ({
  category, avgDeltaSg, avgUserSg: 0, avgBenchmarkSg: 0, roundsCounted: 10,
})

describe("weakestCategory", () => {
  it("picks the most negative delta", () => {
    const trends = [trend("off_tee", -0.12), trend("approach", -0.01), trend("short_game", -0.15), trend("putting", 1.17)]
    expect(weakestCategory(trends)?.category).toBe("short_game")
  })

  it("still picks the lowest when every category is positive", () => {
    expect(weakestCategory([trend("putting", 0.5), trend("approach", 0.2)])?.category).toBe("approach")
  })

  it("returns null with no trend data", () => {
    expect(weakestCategory([])).toBeNull()
  })
})

describe("recommendDrills", () => {
  const library = [
    { id: "a", name: "Bunker Escapes", category: "short_game" as const },
    { id: "b", name: "Greenside Chips", category: "short_game" as const },
    { id: "c", name: "Landing Spot Towel", category: "short_game" as const },
    { id: "d", name: "Up-and-Down Challenge", category: "short_game" as const },
    { id: "e", name: "Lag Putting", category: "putting" as const },
  ]

  it("only returns drills in the requested category, capped at the limit", () => {
    const recs = recommendDrills(library, "short_game", [])
    expect(recs).toHaveLength(3)
    expect(recs.every((d) => d.category === "short_game")).toBe(true)
  })

  it("orders never-done drills first, then least recently completed", () => {
    const history = [
      { drill_id: "a", completed_at: "2026-09-20T12:00:00Z" },
      { drill_id: "b", completed_at: "2026-09-10T12:00:00Z" },
    ]
    const recs = recommendDrills(library, "short_game", history, 4)
    expect(recs.map((d) => d.id)).toEqual(["c", "d", "b", "a"])
  })

  it("ignores started-but-unfinished runs when deciding what's been done", () => {
    const history = [{ drill_id: "a", completed_at: null }]
    expect(recommendDrills(library, "short_game", history)[0].id).toBe("a")
  })

  it("uses the most recent completion when a drill has been done more than once", () => {
    const history = [
      { drill_id: "a", completed_at: "2026-09-01T12:00:00Z" },
      { drill_id: "a", completed_at: "2026-09-25T12:00:00Z" },
      { drill_id: "b", completed_at: "2026-09-15T12:00:00Z" },
      { drill_id: "c", completed_at: "2026-09-16T12:00:00Z" },
      { drill_id: "d", completed_at: "2026-09-17T12:00:00Z" },
    ]
    // a's latest (09-25) is the most recent of all, so it sorts last
    expect(recommendDrills(library, "short_game", history, 4).map((d) => d.id)).toEqual(["b", "c", "d", "a"])
  })
})
