import { describe, it, expect } from "vitest"
import type { RoundSgResult, SgHoleRow } from "@/lib/rounds/roundSg"
import type { HoleSg } from "@/lib/rounds/sgEstimate"
import { improvedThreeInARow, strokesLostPerRound, weaknessScores, type WeaknessRound } from "./weakness"

interface HoleIn {
  putting?: number
  approach?: number
  off_tee?: number
  short_game?: number
  approachStartYds?: number | null
  putts?: number
  firstPuttFt?: number | null
}

function round(id: string, holes: HoleIn[], opts: { score?: number; threePutts?: number } = {}): WeaknessRound {
  const hs: HoleSg[] = holes.map((h, i) => ({
    holeNumber: i + 1,
    total: 0,
    categories: { off_tee: h.off_tee ?? 0, approach: h.approach ?? 0, short_game: h.short_game ?? 0, putting: h.putting ?? 0 },
    approachStartYds: h.approachStartYds ?? null,
    source: "scorecard",
    puttEstimated: false,
  }))
  const rows: SgHoleRow[] = holes.map((h, i) => ({
    hole_number: i + 1,
    par: 4,
    strokes: 4,
    putts: h.putts ?? 2,
    fairway_hit: null,
    green_hit: null,
    penalty: false,
    penalty_shot: null,
    first_putt_ft: h.firstPuttFt ?? null,
  }))
  const sg: RoundSgResult = {
    roundId: id,
    kind: "scorecard",
    holes: hs,
    total: 0,
    totalPer18: 0,
    per18: { off_tee: null, approach: null, short_game: null, putting: null },
    weakest: null,
    holesFromShots: 0,
    holesFromScorecard: hs.length,
  }
  return { sg, holes: rows, tiger5: { holes: [], shots: [], three_putts: opts.threePutts ?? 0 }, score: opts.score ?? 80 }
}

const get = (ws: ReturnType<typeof weaknessScores>, area: string) => ws.find((w) => w.area === area)!

describe("strokesLostPerRound", () => {
  it("splits putting by first_putt_ft: 20 ft and up is lag", () => {
    const r = round("a", [
      { putting: -0.6, firstPuttFt: 30 },
      { putting: -0.2, firstPuttFt: 20 },
      { putting: -0.1, firstPuttFt: 8 },
    ])
    const lost = strokesLostPerRound([r])
    expect(lost.lag_putting.strokesLost).toBeCloseTo((0.8 * 18) / 3)
    expect(lost.short_putting.strokesLost).toBeCloseTo((0.1 * 18) / 3)
  })

  it("with no distance, 3-putt holes are lag and the rest short", () => {
    const r = round("a", [
      { putting: -1, putts: 3 },
      { putting: 0.2, putts: 2 },
    ])
    const lost = strokesLostPerRound([r])
    expect(lost.lag_putting.strokesLost).toBeCloseTo((1 * 18) / 2)
    expect(lost.short_putting.strokesLost).toBeCloseTo((-0.2 * 18) / 2)
  })

  it("splits approach at 120 yd: 120 is a wedge, 121 is not", () => {
    const r = round("a", [
      { approach: -0.3, approachStartYds: 120 },
      { approach: -0.5, approachStartYds: 121 },
    ])
    const lost = strokesLostPerRound([r])
    expect(lost.wedges.strokesLost).toBeCloseTo((0.3 * 18) / 2)
    expect(lost.approach.strokesLost).toBeCloseTo((0.5 * 18) / 2)
  })

  it("reads only the last 10 rounds", () => {
    const rounds = [...Array(10)].map((_, i) => round(`n${i}`, [{ off_tee: -0.1 }])).concat([round("old", [{ off_tee: 5 }])])
    expect(strokesLostPerRound(rounds).tee.strokesLost).toBeCloseTo(1.8)
  })

  it("is null for an area with no data", () => {
    expect(strokesLostPerRound([]).tee).toEqual({ strokesLost: null, rounds: 0 })
  })
})

describe("weaknessScores", () => {
  const rounds = () => [...Array(8)].map((_, i) => round(`r${i}`, [{ putting: -0.5, firstPuttFt: 30 }], { score: 78 + i, threePutts: 1 }))

  it("priority is strokes lost (floored at 0) plus 0.25 x Tiger 5 pressure", () => {
    const ws = weaknessScores(rounds())
    const lag = get(ws, "lag_putting")
    expect(lag.strokesLost).toBeCloseTo(9)
    expect(lag.pressure).toBeCloseTo(1)
    expect(lag.priority).toBeCloseTo(9 + 0.25)
    expect(get(ws, "tee").priority).toBe(0)
  })

  it("an area gaining strokes still carries its Tiger 5 pressure", () => {
    const gaining = rounds().map((r) => ({ ...r, sg: { ...r.sg, holes: [{ ...r.sg.holes[0], categories: { off_tee: 0, approach: 0, short_game: 0, putting: 0.5 } }] } }))
    expect(get(weaknessScores(gaining), "lag_putting").priority).toBeCloseTo(0.25)
  })

  it("cuts 25% for an area whose drill score improved three sessions in a row", () => {
    const base = get(weaknessScores(rounds()), "lag_putting").priority
    const cut = get(weaknessScores(rounds(), { lag_putting: { scores: [20, 15, 12, 9], lowerIsBetter: true } }), "lag_putting")
    expect(cut.improving).toBe(true)
    expect(cut.priority).toBeCloseTo(base * 0.75)
  })

  it("does not cut when the drill did not improve three times", () => {
    const w = get(weaknessScores(rounds(), { lag_putting: { scores: [20, 15, 16, 9], lowerIsBetter: true } }), "lag_putting")
    expect(w.improving).toBe(false)
  })

  it("priorities do not move when only the correlation changes", () => {
    const varied = [...Array(10)].map((_, i) => round(`v${i}`, [{ putting: -0.1 * i, firstPuttFt: 30 }], { score: 70 + i }))
    const x = weaknessScores(varied)
    const y = weaknessScores(varied.map((r, i) => ({ ...r, score: 90 - i * 3 })))
    expect(get(x, "lag_putting").r).toBeCloseTo(1)
    expect(get(y, "lag_putting").r).toBeCloseTo(-1)
    expect(y.map((w) => w.priority)).toEqual(x.map((w) => w.priority))
  })

  it("has no correlation under 8 rounds", () => {
    const few = [...Array(7)].map((_, i) => round(`f${i}`, [{ putting: -0.1 * i, firstPuttFt: 30 }], { score: 70 + i }))
    expect(get(weaknessScores(few), "lag_putting").r).toBeNull()
  })

  it("explains each number in a line, and says when the split used 3-putts", () => {
    const ws = weaknessScores(rounds())
    expect(get(ws, "lag_putting").explanation).toBe("Lag putting: 9.0 strokes/round lost vs scratch, 3-putts on 8 of your last 8 rounds, Tiger 5 mistakes pointing here: 1.0 per round.")
    const noDistance = weaknessScores([round("a", [{ putting: -1, putts: 3 }])])
    expect(get(noDistance, "lag_putting").explanation).toContain("cost of 3-putts")
    expect(get(weaknessScores([]), "tee").explanation).toContain("no rounds")
  })
})

describe("improvedThreeInARow", () => {
  it("needs four scores, each of the last three better than the one before", () => {
    expect(improvedThreeInARow([5, 6, 7], false)).toBe(false)
    expect(improvedThreeInARow([1, 5, 6, 7], false)).toBe(true)
    expect(improvedThreeInARow([9, 8, 7, 6], true)).toBe(true)
    expect(improvedThreeInARow([9, 8, 8, 6], true)).toBe(false)
  })
})

describe("rounds without holes or tracking", () => {
  const totals = (): WeaknessRound => ({
    sg: { roundId: "t", kind: "totals", holes: [], total: null, totalPer18: null, per18: { off_tee: null, approach: -0.4, short_game: -0.2, putting: -0.6 }, weakest: null, holesFromShots: 0, holesFromScorecard: 0 },
    holes: [],
    tiger5: { holes: [], shots: [], three_putts: 1 },
    score: 80,
  })

  it("draws putting from total putts and approach from greens hit, unsplit", () => {
    const lost = strokesLostPerRound([totals()])
    expect(lost.short_putting.strokesLost).toBeCloseTo(0.6)
    expect(lost.approach.strokesLost).toBeCloseTo(0.4)
    expect(lost.short_game.strokesLost).toBeCloseTo(0.2)
    expect(lost.lag_putting.strokesLost).toBeNull()
    expect(lost.wedges.strokesLost).toBeNull()
  })
})
