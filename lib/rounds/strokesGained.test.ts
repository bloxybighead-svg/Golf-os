import { describe, it, expect } from "vitest"
import { landingPoint } from "@/lib/course/geo"
import { getBaseline, type Baseline } from "@/lib/course/baseline"
import { shotHoleSg } from "./strokesGained"
import { shotsToSave } from "./holeTracking"
import type { RoundShot, SwingShot } from "./shots"

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

function swing(n: number, club: string, from: number, fromLie: SwingShot["fromLie"], to: number | null, toLie: SwingShot["toLie"], penaltyStrokes = 0): SwingShot {
  return { holeNumber: 1, shotNumber: n, club, clubConfirmed: true, from: at(from), fromLie, to: to == null ? null : at(to), toLie, penaltyStrokes, pin }
}

const save = (swings: SwingShot[], putts: number): RoundShot[] => shotsToSave(swings, [{ holeNumber: 1, putts }])

// Par 4: driver 0 -> 250 (fairway), 7-iron 250 -> 390 (green), two putts.
const par4 = () => ({
  hole: { holeNumber: 1, par: 4, strokes: 4 },
  shots: save([swing(1, "Driver", 0, "tee", 250, "fairway"), swing(2, "7-Iron", 250, "fairway", 390, "green")], 2),
})

describe("shotHoleSg", () => {
  it("adds up to E(tee) - strokes, whatever the shots were", () => {
    const { hole, shots } = par4()
    const r = shotHoleSg(hole, shots, flat)!
    expect(r.source).toBe("shots")
    expect(r.total).toBeCloseTo(1 + 400 / 100 - 4, 10)
    expect(Object.values(r.categories!).reduce((a, b) => a + b, 0)).toBeCloseTo(r.total, 10)
  })

  it("scores each shot as E(before) - E(after) - 1, in its category", () => {
    const { hole, shots } = par4()
    const c = shotHoleSg(hole, shots, flat)!.categories!
    expect(c.off_tee).toBeCloseTo(5 - (1 + 1.5) - 1, 10) // tee 5.0 -> fairway 150 yd from the pin 2.5
    expect(c.approach).toBeCloseTo(2.5 - 1.5 - 1, 10) // fairway 2.5 -> green 1.5
    expect(c.putting).toBeCloseTo(1.5 - 2, 10)
    expect(c.short_game).toBe(0)
  })

  it("subtracts penalty strokes from the shot that took them", () => {
    const shots = save([swing(1, "Driver", 0, "tee", 250, "rough", 1), swing(2, "7-Iron", 250, "rough", 390, "green")], 2)
    const r = shotHoleSg({ holeNumber: 1, par: 4, strokes: 5 }, shots, flat)!
    expect(r.categories!.off_tee).toBeCloseTo(5 - (1 + 1.5 + 0.5) - 1 - 1, 10)
  })

  it("treats a shot that ends in water as played from the rough", () => {
    const shots = save([swing(1, "Driver", 0, "tee", 250, "water", 1), swing(2, "7-Iron", 250, "rough", 390, "green")], 2)
    expect(shotHoleSg({ holeNumber: 1, par: 4, strokes: 5 }, shots, flat)!.total).toBeCloseTo(5 - 5, 10)
  })

  it("is null for a hole whose shots do not match its score, or that was not holed", () => {
    const { hole, shots } = par4()
    expect(shotHoleSg({ ...hole, strokes: 5 }, shots, flat)).toBeNull()
    expect(shotHoleSg({ ...hole, strokes: 3 }, shots, flat)).toBeNull()
    expect(shotHoleSg({ holeNumber: 1, par: 4, strokes: 1 }, save([swing(1, "Driver", 0, "tee", 250, "fairway")], 0), flat)).toBeNull()
  })

  it("files a par 3 tee shot under approach and a short non-green shot under short game", () => {
    const shots = save([swing(1, "7-Iron", 0, "tee", 380, "rough"), swing(2, "Chip", 380, "rough", 396, "green")], 2)
    const r = shotHoleSg({ holeNumber: 1, par: 3, strokes: 4 }, shots, flat)!
    expect(r.categories!.approach).not.toBe(0)
    expect(r.categories!.short_game).not.toBe(0)
    expect(r.categories!.off_tee).toBe(0)
    expect(r.approachStartYds).toBeCloseTo(400, 3)
  })

  it("a holed swing needs no putts", () => {
    const hole = { holeNumber: 1, par: 3, strokes: 1 }
    const holed: SwingShot = { ...swing(1, "7-Iron", 0, "tee", null, "holed"), to: pin }
    const r = shotHoleSg(hole, save([holed], 0), flat)!
    expect(r.total).toBeCloseTo(5 - 1, 10)
    expect(r.categories!.putting).toBe(0)
  })

  it("with the first putt's start unknown, the putt is the scorecard estimate and says so", () => {
    const shots = save([swing(1, "Driver", 0, "tee", 250, "fairway"), swing(2, "7-Iron", 250, "fairway", null, "green")], 2)
    const r = shotHoleSg({ holeNumber: 1, par: 4, strokes: 4 }, shots, flat)!
    expect(r.puttEstimated).toBe(true)
    expect(Object.values(r.categories!).reduce((a, b) => a + b, 0)).toBeCloseTo(r.total, 10)
  })

  it("works with the real baselines: the same 4 beats a 20's expectation by more than a scratch golfer's", () => {
    const { hole, shots } = par4()
    const sg = (h: number) => shotHoleSg(hole, shots, getBaseline(h))!.total
    expect(sg(20)).toBeGreaterThan(sg(0))
  })
})
