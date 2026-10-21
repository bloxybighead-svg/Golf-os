import { describe, it, expect } from "vitest"
import { fromLocal } from "@/lib/course/geo"
import { makeRng, randNormal } from "@/lib/golfer/rng"
import { shotsToSave } from "./holeTracking"
import type { RoundShot, SwingShot } from "./shots"
import { clubGroup, lateralSamples, MIN_GROUP_SHOTS, modelSpread, suggestSpread, type LateralSample } from "./spreadCalibration"

const origin = { lat: 40, lng: -74 }
const at = (x: number, y: number) => fromLocal(origin, { x, y })

describe("clubGroup", () => {
  it("sorts the bag into four groups and leaves out what is not a full swing", () => {
    expect(["Driver", "5-Wood", "5-Iron", "8-Iron", "GW"].map(clubGroup)).toEqual(["woods", "woods", "long_irons", "short_irons", "wedges"])
    expect(clubGroup("Putter")).toBeNull()
    expect(clubGroup("SW 3/4")).toBeNull()
  })
})

describe("lateralSamples", () => {
  const pin = at(0, 400)
  function hole(shots: Partial<SwingShot>[]): RoundShot[] {
    const swings: SwingShot[] = shots.map((s, i) => ({
      holeNumber: 1, shotNumber: i + 1, club: "Driver", clubConfirmed: true, from: at(0, 0), fromLie: "tee", to: at(10, 250), toLie: "green", penaltyStrokes: 0, pin, ...s,
    }))
    return shotsToSave(swings, [{ holeNumber: 1, putts: 2 }])
  }

  const complete = (shots: RoundShot[]) => ({ shots, completeHoles: new Set([1]) })

  it("measures how far right of the line to the pin the shot finished", () => {
    const [s] = lateralSamples([complete(hole([{}]))])
    expect(s.club).toBe("Driver")
    expect(s.lateralYds).toBeCloseTo(10, 1)
    expect(s.distYds).toBeCloseTo(Math.hypot(10, 250), 1)
  })

  it("is negative to the left, measured from the line start-to-pin rather than north", () => {
    const [s] = lateralSamples([complete(hole([{ from: at(100, 0), to: at(0, 250) }]))])
    expect(s.lateralYds).toBeLessThan(0)
  })

  it("leaves out putts, penalised or wet shots, and holes with no pin", () => {
    const rows = hole([{}, { penaltyStrokes: 1 }, { toLie: "water" }, {}])
    expect(lateralSamples([complete(rows)])).toHaveLength(2)
    expect(lateralSamples([complete(rows.filter((r) => r.toLie !== "holed"))])).toEqual([])
  })

  it("uses only complete holes and clubs the golfer picked", () => {
    expect(lateralSamples([{ shots: hole([{}]), completeHoles: new Set() }])).toEqual([])
    expect(lateralSamples([complete(hole([{ clubConfirmed: false }]))])).toEqual([])
  })
})

describe("suggestSpread", () => {
  // The planner's driver: 250 yd, 12 yd offline SD. Its wedge: 100 yd, 4 yd.
  const model = modelSpread(
    ["Driver", "SW"].map((club) => {
      const rng = makeRng(club === "Driver" ? 1 : 2)
      const [carry, offline] = club === "Driver" ? [250, 12] : [100, 4]
      return { club, shots: Array.from({ length: 2000 }, () => ({ carryYds: carry + randNormal(rng, 0, 5), offlineYds: randNormal(rng, 0, offline) })) }
    })
  )
  const golfer = (club: string, n: number, carry: number, offlineSd: number, widen: number, seed: number): LateralSample[] => {
    const rng = makeRng(seed)
    return Array.from({ length: n }, () => ({ club, distYds: carry, lateralYds: 3 + randNormal(rng, 0, offlineSd * widen) }))
  }

  it("recovers how much wider than the model the golfer is, whatever their aim offset", () => {
    const s = suggestSpread(golfer("Driver", 400, 250, 12, 1.3, 7), model)!
    expect(s.ratio).toBeGreaterThan(1.22)
    expect(s.ratio).toBeLessThan(1.38)
    expect(s.shots).toBe(400)
  })

  it("scales a shorter shot by its distance", () => {
    const s = suggestSpread(golfer("Driver", 400, 125, 6, 1.3, 8), model)! // half the carry, half the offline
    expect(s.ratio).toBeGreaterThan(1.22)
    expect(s.ratio).toBeLessThan(1.38)
  })

  it("says nothing until a group has 20 shots, and ignores groups that have fewer", () => {
    expect(suggestSpread(golfer("Driver", MIN_GROUP_SHOTS - 1, 250, 12, 1.3, 9), model)).toBeNull()
    const s = suggestSpread([...golfer("Driver", 60, 250, 12, 1.3, 10), ...golfer("SW", 5, 100, 4, 3, 11)], model)!
    expect(s.groups.map((g) => g.group)).toEqual(["woods"])
    expect(s.shots).toBe(60)
  })

  it("pools the groups that qualify and reports each", () => {
    const s = suggestSpread([...golfer("Driver", 200, 250, 12, 1.2, 12), ...golfer("SW", 200, 100, 4, 1.4, 13)], model)!
    expect(s.groups.map((g) => g.group)).toEqual(["woods", "wedges"])
    expect(s.ratio).toBeGreaterThan(s.groups[0].ratio - 0.01)
    expect(s.ratio).toBeLessThan(s.groups[1].ratio + 0.01)
    expect(s.shots).toBe(400)
  })

  it("skips a club the planner has no spread for", () => {
    expect(suggestSpread(golfer("7-Iron", 40, 150, 6, 1.3, 14), model)).toBeNull()
  })
})
