import { describe, it, expect } from "vitest"
import { landingPoint } from "@/lib/course/geo"
import type { RoundShot } from "./shots"
import { summarizeTiger5, tiger5, tiger5Pressure, type Tiger5Hole, type Tiger5Round } from "./tiger5"

const hole = (over: Partial<Tiger5Hole> = {}): Tiger5Hole => ({ hole_number: 1, par: 4, strokes: 4, putts: 2, ...over })
const round = (holes: Tiger5Hole[], shots: RoundShot[] = [], three_putts: number | null = null): Tiger5Round => ({ holes, shots, three_putts })

const tee = { lat: 40, lng: -74 }
const at = (yd: number) => landingPoint(tee, 0, yd, 0)
const shot = (n: number, club: string, fromYd: number, fromLie: RoundShot["fromLie"], over: Partial<RoundShot> = {}): RoundShot => ({
  holeNumber: 1,
  shotNumber: n,
  club,
  clubConfirmed: true,
  from: at(fromYd),
  fromLie,
  to: at(fromYd + 10),
  toLie: "fairway",
  penaltyStrokes: 0,
  ...over,
})
const holed = (n: number, club: string, fromYd: number, fromLie: RoundShot["fromLie"]) => shot(n, club, fromYd, fromLie, { to: at(400), toLie: "holed" })

describe("items from the scorecard", () => {
  it("counts a par-5 bogey, a double, and one hole can be both", () => {
    const r = tiger5(round([hole({ par: 5, strokes: 7, putts: 2 }), hole({ hole_number: 2, par: 4, strokes: 5 })]))
    expect(r.items.par5_bogey).toBe(1)
    expect(r.items.double).toBe(1)
  })
  it("a par-5 bogey is not a double", () => {
    const r = tiger5(round([hole({ par: 5, strokes: 6 })]))
    expect([r.items.par5_bogey, r.items.double]).toEqual([1, 0])
  })
  it("counts three-putts, and a hole with no putts leaves the item unknown", () => {
    expect(tiger5(round([hole({ putts: 3 }), hole({ hole_number: 2, putts: 4 }), hole({ hole_number: 3 })])).items.three_putt).toBe(2)
    const unknown = tiger5(round([hole({ putts: 3 }), hole({ hole_number: 2, putts: null })]))
    expect(unknown.items.three_putt).toBeNull()
  })
})

describe("wedge bogey", () => {
  it("is zero on a hole that was not a bogey, whatever the answer", () => {
    expect(tiger5(round([hole({ wedge_in_hand: true })])).items.wedge_bogey).toBe(0)
  })
  it("reads the answer on an untracked bogey, and is unknown without one", () => {
    expect(tiger5(round([hole({ strokes: 5, wedge_in_hand: true })])).items.wedge_bogey).toBe(1)
    expect(tiger5(round([hole({ strokes: 5, wedge_in_hand: false })])).items.wedge_bogey).toBe(0)
    expect(tiger5(round([hole({ strokes: 5 })])).items.wedge_bogey).toBeNull()
  })
  it("reads the shots on a tracked bogey, partials included, and ignores the answer", () => {
    const h = hole({ strokes: 5, tracking: "complete", wedge_in_hand: false })
    const wedge = [shot(1, "Driver", 0, "tee"), shot(2, "PW 3/4", 100, "rough"), holed(3, "Putter", 380, "green")]
    expect(tiger5(round([h], wedge)).items.wedge_bogey).toBe(1)
    const long = [shot(1, "Driver", 0, "tee"), shot(2, "8-Iron", 150, "fairway"), holed(3, "Putter", 380, "green")]
    expect(tiger5(round([h], long)).items.wedge_bogey).toBe(0)
  })
  it("a wedge from the green does not count; a par-3 tee shot does", () => {
    const h = hole({ par: 3, strokes: 4, tracking: "complete" })
    expect(tiger5(round([h], [shot(1, "9-Iron", 0, "tee"), holed(2, "Putter", 150, "green")])).items.wedge_bogey).toBe(1)
    expect(tiger5(round([h], [shot(1, "6-Iron", 0, "tee"), holed(2, "SW", 150, "green")])).items.wedge_bogey).toBe(0)
  })
})

describe("blown up-and-down", () => {
  const h = hole({ strokes: 5, tracking: "complete", easy_updown_missed: false })
  it("is a shot inside 30 yd from fairway or rough followed by more than 2 strokes", () => {
    const blown = [shot(1, "Driver", 0, "tee"), shot(2, "7-Iron", 150, "fairway"), shot(3, "SW", 380, "rough"), shot(4, "Putter", 395, "green"), holed(5, "Putter", 398, "green")]
    expect(tiger5(round([h], blown)).items.updown).toBe(1)
  })
  it("is not blown with a chip and one putt, from a bunker, or from beyond 30 yd", () => {
    const ok = [shot(1, "Driver", 0, "tee"), shot(2, "SW", 380, "rough"), holed(3, "Putter", 398, "green")]
    expect(tiger5(round([hole({ strokes: 3, tracking: "complete" })], ok)).items.updown).toBe(0)
    const bunker = [shot(1, "Driver", 0, "tee"), shot(2, "SW", 380, "bunker"), shot(3, "Putter", 395, "green"), holed(4, "Putter", 398, "green")]
    expect(tiger5(round([hole({ strokes: 4, tracking: "complete" })], bunker)).items.updown).toBe(0)
    const far = [shot(1, "Driver", 0, "tee"), shot(2, "SW", 340, "rough"), shot(3, "Putter", 395, "green"), holed(4, "Putter", 398, "green")]
    expect(tiger5(round([hole({ strokes: 4, tracking: "complete" })], far)).items.updown).toBe(0)
  })
  it("counts a penalty stroke on the shot", () => {
    const pen = [shot(1, "Driver", 0, "tee"), shot(2, "SW", 380, "rough", { penaltyStrokes: 1 }), holed(3, "Putter", 398, "green")]
    expect(tiger5(round([hole({ strokes: 4, tracking: "complete" })], pen)).items.updown).toBe(1)
  })
  it("reads the answer when the hole is not tracked", () => {
    expect(tiger5(round([hole({ strokes: 5, easy_updown_missed: true })])).items.updown).toBe(1)
    expect(tiger5(round([hole({ strokes: 5 })])).items.updown).toBeNull()
    expect(tiger5(round([hole({ strokes: 4, easy_updown_missed: true })])).items.updown).toBe(0)
  })
})

describe("box score rounds", () => {
  it("know only their three-putts", () => {
    const r = tiger5(round([], [], 2))
    expect(r.items).toEqual({ par5_bogey: null, double: null, three_putt: 2, wedge_bogey: null, updown: null })
    expect([r.total, r.known]).toEqual([2, 1])
  })
  it("know nothing without a three-putt count", () => {
    expect(tiger5(round([])).known).toBe(0)
  })
})

describe("total", () => {
  it("sums the known items and says how many are known", () => {
    const r = tiger5(round([hole({ par: 5, strokes: 7, putts: 3 })]))
    expect([r.items.par5_bogey, r.items.double, r.items.three_putt, r.items.wedge_bogey, r.items.updown]).toEqual([1, 1, 1, null, null])
    expect([r.total, r.known]).toEqual([3, 3])
  })
})

describe("tiger5Pressure", () => {
  it("maps each mistake to its areas, averaged per round", () => {
    const a = round([hole({ par: 5, strokes: 6, putts: 3, wedge_in_hand: true, easy_updown_missed: true })])
    const b = round([hole({ par: 4, strokes: 4, putts: 2 })])
    const p = tiger5Pressure([a, b])
    // par-5 bogey 0.5/round -> wedges + tee; three-putt 0.5 -> lag; wedge bogey 0.5 -> wedges + short putting; updown 0.5 -> short game + short putting
    expect(p).toEqual({ lag_putting: 0.5, short_putting: 1, short_game: 0.5, wedges: 1, approach: 0, tee: 0.5 })
  })
  it("ignores doubles and averages an item only over rounds that know it", () => {
    const known = round([hole({ strokes: 6, putts: 3 })]) // a double and a three-putt
    const boxScore = round([], [], null) // knows nothing
    const p = tiger5Pressure([known, boxScore])
    expect(p.lag_putting).toBe(1)
    expect(p.tee + p.wedges + p.short_game).toBe(0)
  })
})

describe("summarizeTiger5", () => {
  const r = (holesPlayed: number, three: number | null, par5: number | null = null) => ({
    holesPlayed,
    result: { items: { par5_bogey: par5, double: null, three_putt: three, wedge_bogey: null, updown: null }, total: 0, known: 0 },
  })
  it("rates each item per 18 over the rounds that know it", () => {
    const s = summarizeTiger5([r(18, 2, 1), r(9, 1), r(18, null)])
    expect(s.items.find((i) => i.item === "three_putt")).toMatchObject({ count: 3, rounds: 2, per18: (3 / 27) * 18 })
    expect(s.items.find((i) => i.item === "par5_bogey")).toMatchObject({ count: 1, rounds: 1, per18: 1 })
    expect(s.items.find((i) => i.item === "double")?.per18).toBeNull()
    expect(s.per18).toBeCloseTo(2 + 1, 5)
    expect(s.most).toBe("three_putt")
  })
  it("has no most-frequent item when nothing happened or nothing is known", () => {
    expect(summarizeTiger5([r(18, 0)]).most).toBeNull()
    expect(summarizeTiger5([r(18, null)])).toMatchObject({ per18: null, most: null })
  })
})
