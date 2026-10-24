import { describe, it, expect } from "vitest"
import { getBaseline } from "@/lib/course/baseline"
import { roundSg, type SgHoleRow, type SgRound } from "@/lib/rounds/roundSg"
import { resolveHoleYards } from "@/lib/rounds/sgEstimate"
import { weaknessScores } from "./weakness"
import { buildWeek } from "./week"
import { buildSession } from "./session"

// The pieces together on real roundSg output: scorecard rounds in, a week and a session out.
describe("engine end to end", () => {
  const baseline = getBaseline(null)
  const ctx = { baseline, driverTotalYds: 250, yardsFor: (_n: number, par: number) => resolveHoleYards({ par, holeYds: null, courseTotalYds: null }) }
  const hole = (n: number, strokes: number, putts: number, ft: number | null): SgHoleRow => ({
    hole_number: n, par: 4, strokes, putts, fairway_hit: true, green_hit: strokes - putts <= 2, penalty: false, penalty_shot: null, first_putt_ft: ft,
  })
  const make = (i: number) => {
    const holes = [hole(1, 5, 3, 35), hole(2, 4, 2, 8), hole(3, 5, 3, 40), hole(4, 4, 2, 6)]
    const row: SgRound = { id: `r${i}`, holes_played: 4, fairways_pct: null, gir_pct: null, total_putts: 10, up_and_downs: null }
    return { sg: roundSg(row, holes, [], ctx), holes, tiger5: { holes: holes.map((h) => ({ ...h, tracking: null })), shots: [], three_putts: null }, score: 80 + (i % 3) }
  }

  it("turns rounds into a priority-ordered week and a session", () => {
    const scores = weaknessScores([...Array(10)].map((_, i) => make(i)))
    expect(scores.find((s) => s.area === "lag_putting")!.strokesLost).toBeGreaterThan(0)
    const week = buildWeek(Object.fromEntries(scores.map((s) => [s.area, s.priority])) as Parameters<typeof buildWeek>[0])
    expect(week.items.length).toBeGreaterThan(0)
    const drill = { id: "x", name: "Lag", category: "putting", description: null, target_area: null, difficulty: "intermediate", reps_suggested: null, time_estimate_mins: 20, instructions: null, equipment_needed: null, practice_category: "lag_putting", locations: ["putting_green"], equipment: null, structure: "blocked", pressure: 0, metric: "count_of_n", lower_is_better: true, sets: [{ label: "s", setup: "s", balls: 10 }], levels: [{ name: "n", rule: "r" }], cue: "c", routine_rule: "r", source_url: "https://x", status: "active" } as const
    const session = buildSession({ week: week.items, now: new Date(2026, 9, 21, 10), minutes: 60, location: "putting_green", energy: "ok", nextRound: null, history: [], library: [{ ...drill, locations: ["putting_green"], sets: [...drill.sets], levels: [...drill.levels] }], levels: {} })
    expect(session.blocks.length).toBeGreaterThan(0)
  })
})
