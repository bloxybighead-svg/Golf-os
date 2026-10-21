import { describe, expect, it } from "vitest"
import { getBaseline } from "@/lib/course/baseline"
import { landingPoint } from "@/lib/course/geo"
import { shotsToSave } from "./holeTracking"
import { categoryStrokesLostPerRound, describeBasis, roundSg, summarizeRounds, type SgContext, type SgHoleRow, type SgRound } from "./roundSg"
import { resolveHoleYards } from "./sgEstimate"
import type { SwingShot } from "./shots"

const baseline = getBaseline(0)
const ctx: SgContext = { baseline, driverTotalYds: 250, yardsFor: (_n, par) => resolveHoleYards({ par, holeYds: null, courseTotalYds: null }) }

const round = (over: Partial<SgRound> = {}): SgRound => ({ id: "r1", holes_played: 2, fairways_pct: null, gir_pct: null, total_putts: null, up_and_downs: null, ...over })
const hole = (n: number, over: Partial<SgHoleRow> = {}): SgHoleRow => ({
  hole_number: n,
  par: 4,
  strokes: 4,
  putts: 2,
  fairway_hit: true,
  green_hit: true,
  penalty: false,
  penalty_shot: null,
  ...over,
})

const tee = { lat: 40, lng: -74 }
const at = (yd: number) => landingPoint(tee, 0, yd, 0)
const pin = at(400)
const swing = (n: number, club: string, from: number, fromLie: SwingShot["fromLie"], to: number, toLie: SwingShot["toLie"]): SwingShot => ({
  holeNumber: 1, shotNumber: n, club, clubConfirmed: true, from: at(from), fromLie, to: at(to), toLie, penaltyStrokes: 0, pin,
})
// A complete tracked hole 1: a drive that left a short approach, then 2 putts, for a 4.
const trackedShots = () => shotsToSave([swing(1, "Driver", 0, "tee", 330, "fairway"), swing(2, "PW", 330, "fairway", 395, "green")], [{ holeNumber: 1, putts: 2 }])

describe("roundSg", () => {
  it("a complete tracked hole uses its shots; the others use the scorecard", () => {
    const r = roundSg(round(), [hole(1, { tracking: "complete" }), hole(2)], trackedShots(), ctx)
    expect(r.holes.map((h) => h.source)).toEqual(["shots", "scorecard"])
    expect(r.kind).toBe("shots")
    expect(r.holesFromShots).toBe(1)
    expect(r.holesFromScorecard).toBe(1)
  })

  it("a partial hole uses the scorecard even when it has shots", () => {
    const r = roundSg(round(), [hole(1, { tracking: "partial" }), hole(2)], trackedShots(), ctx)
    expect(r.holes.map((h) => h.source)).toEqual(["scorecard", "scorecard"])
    expect(r.kind).toBe("scorecard")
  })

  it("holes backfilled as partial, whatever their old shots, use the scorecard", () => {
    const r = roundSg(round({ holes_played: 1 }), [hole(1, { tracking: "partial" })], trackedShots(), ctx)
    expect(r.kind).toBe("scorecard")
  })

  it("a complete hole whose shots do not add up to its score falls back to the scorecard", () => {
    const r = roundSg(round({ holes_played: 1 }), [hole(1, { tracking: "complete", strokes: 5 })], trackedShots(), ctx)
    expect(r.holes[0].source).toBe("scorecard")
  })

  it("totals the holes, scales to 18, and finds the weakest category", () => {
    const r = roundSg(round(), [hole(1, { putts: 3, strokes: 5 }), hole(2, { putts: 3, strokes: 5 })], [], ctx)
    expect(r.total).toBeCloseTo(r.holes[0].total + r.holes[1].total, 9)
    expect(r.totalPer18).toBeCloseTo((r.total! * 18) / 2, 9)
    expect(r.weakest).toBe("putting")
  })

  it("holes without putts add to the total but not to a category", () => {
    const r = roundSg(round(), [hole(1, { putts: null }), hole(2, { putts: null })], [], ctx)
    expect(r.total).not.toBeNull()
    expect(Object.values(r.per18).every((v) => v === null)).toBe(true)
    expect(r.weakest).toBeNull()
  })

  it("a round with no holes is the proxy from its totals", () => {
    const r = roundSg(round({ holes_played: 18, fairways_pct: 50, gir_pct: 40, total_putts: 34, up_and_downs: 3 }), [], [], ctx)
    expect(r.kind).toBe("totals")
    expect(r.total).toBeNull()
    expect(r.per18.putting).toBe(-4) // 30 scratch putts - 34
    expect(r.holes).toEqual([])
  })
})

describe("summaries", () => {
  const a = roundSg(round({ id: "a" }), [hole(1, { putts: 3, strokes: 5 }), hole(2, { putts: 3, strokes: 5 })], [], ctx)
  const b = roundSg(round({ id: "b" }), [hole(1, { tracking: "complete" }), hole(2)], trackedShots(), ctx)
  const c = roundSg(round({ id: "c", holes_played: 18, total_putts: 33 }), [], [], ctx)

  it("averages each category per round and lists the per-round values", () => {
    const s = summarizeRounds([a, b, c])
    expect(s.rounds).toBe(3)
    const putting = s.categories.find((x) => x.category === "putting")!
    expect(putting.rounds.map((x) => x.roundId)).toEqual(["a", "b", "c"])
    expect(putting.perRound).toBeCloseTo((a.per18.putting! + b.per18.putting! + c.per18.putting!) / 3, 9)
    expect(s.categories.find((x) => x.category === "approach")!.rounds.map((x) => x.roundId)).toEqual(["a", "b"]) // the box score has no approach
  })

  it("says what the numbers rest on", () => {
    expect(describeBasis(summarizeRounds([a, b, c]))).toBe("3 rounds: 1 from your scorecard, 1 with tracked shots, 1 from round totals")
    expect(describeBasis(summarizeRounds([a]))).toBe("1 round: 1 from your scorecard")
  })

  it("strokes lost per round is the other sign", () => {
    const loss = categoryStrokesLostPerRound([a])
    expect(loss.find((x) => x.category === "putting")!.strokesLost).toBeCloseTo(-a.per18.putting!, 9)
    expect(loss.find((x) => x.category === "putting")!.strokesLost).toBeGreaterThan(0)
    expect(categoryStrokesLostPerRound([])).toEqual([])
  })
})
