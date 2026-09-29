import { describe, it, expect } from "vitest"
import { blankHoles, cleanHoles, summarizeHoles, upAndDownPct, type ScoredHole } from "./holes"
import { computeUserSg } from "@/lib/sgBenchmarks"

function hole(n: number, over: Partial<ScoredHole> = {}): ScoredHole {
  return { ...blankHoles(1)[0], hole_number: n, strokes: 4, ...over }
}

describe("cleanHoles", () => {
  it("drops a fairway on a par 3 and miss sides that don't go with a miss", () => {
    const [a, b] = cleanHoles([
      hole(1, { par: 3, strokes: 3, fairway_hit: true, green_hit: true, green_miss_side: "left" }),
      hole(2, { fairway_hit: false, fairway_miss_side: "right" }),
    ])
    expect(a.fairway_hit).toBeNull()
    expect(a.green_miss_side).toBeNull()
    expect(b.fairway_miss_side).toBe("right")
  })
  it("rejects a hole without a score, repeated holes and more putts than strokes", () => {
    expect(() => cleanHoles([hole(1, { strokes: null as unknown as number })])).toThrow("Hole 1 needs a score")
    expect(() => cleanHoles([hole(1), hole(1)])).toThrow()
    expect(() => cleanHoles([hole(1, { strokes: 2, putts: 3 })])).toThrow("more putts")
  })
})

describe("summarizeHoles", () => {
  // Par 4, 3, 5, 4: fairway hit / (par 3) / missed left / missed right.
  // Greens: hit, missed short (still 3 = par: an up and down), missed left (6 on a par 5: not), hit.
  const holes: ScoredHole[] = [
    hole(1, { par: 4, strokes: 4, fairway_hit: true, green_hit: true, putts: 2 }),
    hole(2, { par: 3, strokes: 3, green_hit: false, green_miss_side: "short", putts: 1 }),
    hole(3, { par: 5, strokes: 6, fairway_hit: false, fairway_miss_side: "left", green_hit: false, green_miss_side: "left", putts: 2, penalty: true }),
    hole(4, { par: 4, strokes: 5, fairway_hit: false, fairway_miss_side: "right", green_hit: true, putts: 3 }),
  ]

  it("computes the box score from taps alone", () => {
    expect(summarizeHoles(holes)).toEqual({
      holes_played: 4,
      score: 18,
      par: 16,
      fairways_pct: 33.3,
      miss_left_pct: 33.3,
      miss_right_pct: 33.3,
      gir_pct: 50,
      total_putts: 8,
      three_putts: 1,
      up_and_downs: 1,
      up_and_down_chances: 2,
      up_and_down_pct: 50,
      penalties: 1,
    })
  })

  it("leaves a stat empty when it was never tapped, and putts empty when any hole lacks them", () => {
    const s = summarizeHoles([hole(1), hole(2, { putts: 2 })])
    expect(s.fairways_pct).toBeNull()
    expect(s.gir_pct).toBeNull()
    expect(s.up_and_downs).toBeNull()
    expect(s.total_putts).toBeNull()
    expect(s.score).toBe(8)
  })

  it("feeds the saved round's short-game numbers the same way the proxy reads them", () => {
    const s = summarizeHoles(holes)
    expect(upAndDownPct({ ...s })).toBe(50)
    const sg = computeUserSg({ holesPlayed: 4, fairwaysPct: s.fairways_pct, girPct: s.gir_pct, totalPutts: s.total_putts, upAndDowns: s.up_and_downs })
    expect(sg.map((c) => c.category)).toEqual(["off_tee", "approach", "short_game", "putting"])
  })
})
