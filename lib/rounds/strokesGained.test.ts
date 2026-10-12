import { describe, it, expect } from "vitest"
import { landingPoint } from "@/lib/course/geo"
import { getBaseline, type Baseline } from "@/lib/course/baseline"
import { strokesGainedForRound, summarizeSg, type HoleResult } from "./strokesGained"
import { shotsToSave, type RoundShot, type SwingShot } from "./shots"

const tee = { lat: 40, lng: -74 }
const at = (yd: number) => landingPoint(tee, 0, yd, 0)
const pin = at(400)

// A baseline anyone can check by hand: 1 stroke plus 1 per 100 yd, rough costs 0.5 more, putting is flat 1.5.
const flat: Baseline = {
  handicap: 0,
  label: "test",
  expectedStrokesRemaining: () => 0,
  expectedFromStart: (lie, d) => (lie === "green" ? 1.5 : 1 + d / 100 + (lie === "rough" ? 0.5 : 0)),
  fairway: () => 0,
}

function swing(n: number, club: string, from: number, fromLie: SwingShot["fromLie"], to: number, toLie: SwingShot["toLie"], penaltyStrokes = 0): SwingShot {
  return { holeNumber: 1, shotNumber: n, club, from: at(from), fromLie, to: at(to), toLie, penaltyStrokes, pin }
}

// Par 4: driver 0 -> 250 (fairway), 7-iron 250 -> 390 (green), two putts.
const par4 = (): { hole: HoleResult; shots: RoundShot[] } => ({
  hole: { holeNumber: 1, par: 4, strokes: 4 },
  shots: shotsToSave([swing(1, "Driver", 0, "tee", 250, "fairway"), swing(2, "7-Iron", 250, "fairway", 390, "green")], new Map([[1, 2]])),
})

describe("strokesGainedForRound", () => {
  it("adds up to E(tee) - strokes, whatever the shots were", () => {
    const { hole, shots } = par4()
    const r = strokesGainedForRound([hole], shots, flat)
    const total = r.shots.reduce((n, s) => n + s.sg, 0)
    expect(total).toBeCloseTo(1 + 400 / 100 - 4, 10)
  })

  it("scores each shot as E(before) - E(after) - 1", () => {
    const { hole, shots } = par4()
    const [drive, iron, putts] = strokesGainedForRound([hole], shots, flat).shots
    expect(drive).toMatchObject({ category: "off_tee", count: 1 })
    expect(drive.sg).toBeCloseTo(5 - (1 + 1.5) - 1, 10) // tee 5.0 -> fairway 150 yd from the pin 2.5
    expect(iron).toMatchObject({ category: "approach" })
    expect(iron.sg).toBeCloseTo(2.5 - 1.5 - 1, 10) // fairway 2.5 -> green 1.5
    expect(putts).toMatchObject({ category: "putting", count: 2 })
    expect(putts.sg).toBeCloseTo(1.5 - 2, 10)
  })

  it("subtracts penalty strokes from the shot that took them", () => {
    const withPenalty = [swing(1, "Driver", 0, "tee", 250, "rough", 1), swing(2, "7-Iron", 250, "rough", 390, "green")]
    const hole = { holeNumber: 1, par: 4, strokes: 5 }
    const [drive] = strokesGainedForRound([hole], shotsToSave(withPenalty, new Map([[1, 2]])), flat).shots
    expect(drive.sg).toBeCloseTo(5 - (1 + 1.5 + 0.5) - 1 - 1, 10)
  })

  it("treats a shot that ends in water as played from the rough", () => {
    const wet = [swing(1, "Driver", 0, "tee", 250, "water", 1), swing(2, "7-Iron", 250, "rough", 390, "green")]
    const hole = { holeNumber: 1, par: 4, strokes: 5 }
    const total = strokesGainedForRound([hole], shotsToSave(wet, new Map([[1, 2]])), flat).shots.reduce((n, s) => n + s.sg, 0)
    expect(total).toBeCloseTo(5 - 5, 10)
  })

  it("skips a hole whose shots do not match its score", () => {
    const { hole, shots } = par4()
    expect(strokesGainedForRound([{ ...hole, strokes: 5 }], shots, flat)).toEqual({ shots: [], holesCounted: 0 })
    expect(strokesGainedForRound([{ ...hole, strokes: 3 }], shots, flat).holesCounted).toBe(0)
  })

  it("skips a hole that was not holed at a pin (no putts recorded)", () => {
    const only = shotsToSave([swing(1, "Driver", 0, "tee", 250, "fairway")], new Map())
    expect(strokesGainedForRound([{ holeNumber: 1, par: 4, strokes: 1 }], only, flat).holesCounted).toBe(0)
  })

  it("skips a hole with no recorded shots at all", () => {
    expect(strokesGainedForRound([{ holeNumber: 2, par: 4, strokes: 4 }], par4().shots, flat).holesCounted).toBe(0)
  })

  it("files a par 3 tee shot under approach and a short non-green shot under around the green", () => {
    const hole = { holeNumber: 1, par: 3, strokes: 4 }
    const shots = shotsToSave(
      [swing(1, "7-Iron", 0, "tee", 380, "rough"), swing(2, "SW", 380, "rough", 396, "green")],
      new Map([[1, 2]])
    )
    const r = strokesGainedForRound([hole], shots, flat)
    expect(r.shots.map((s) => s.category)).toEqual(["approach", "short_game", "putting"])
  })

  it("scores a one-putt hole as one putting unit", () => {
    const hole = { holeNumber: 1, par: 3, strokes: 2 }
    const shots = shotsToSave([swing(1, "7-Iron", 0, "tee", 390, "green")], new Map([[1, 1]]))
    const r = strokesGainedForRound([hole], shots, flat)
    expect(r.shots[1]).toMatchObject({ category: "putting", count: 1 })
  })

  it("works with the real baselines: a scratch golfer's expectations are tighter than a 20's", () => {
    const { hole, shots } = par4()
    const sg = (h: number | null) => strokesGainedForRound([hole], shots, getBaseline(h)).shots.reduce((n, s) => n + s.sg, 0)
    expect(sg(20)).toBeGreaterThan(sg(0)) // the same 4 beats a 20's expectation by more
  })
})

describe("summarizeSg", () => {
  it("totals by category, counts shots, and scales to 18 holes", () => {
    const { hole, shots } = par4()
    const round = strokesGainedForRound([hole], shots, flat)
    const s = summarizeSg([round, round])
    expect(s).toMatchObject({ rounds: 2, holesCounted: 2 })
    expect(s.categories.map((c) => c.category)).toEqual(["off_tee", "approach", "short_game", "putting"])
    const putting = s.categories[3]
    expect(putting.shots).toBe(4)
    expect(putting.total).toBeCloseTo(-1, 10)
    expect(putting.per18).toBeCloseTo((-1 / 2) * 18, 10)
    expect(s.categories[2]).toEqual({ category: "short_game", total: 0, shots: 0, per18: 0 })
  })

  it("is all zeros with nothing counted", () => {
    expect(summarizeSg([]).categories.every((c) => c.total === 0 && c.per18 === 0)).toBe(true)
  })
})
