import { describe, expect, it } from "vitest"
import { fromLocal, toLocal } from "./geo"
import type { Lie, LieMap } from "./lies"
import { BASE_ROLL_YDS, clubGroup, rollToRest, rollYds } from "./roll"
import { evaluateClub, simulateLandings } from "./plan"
import { buildLieMap } from "./lies"
import { seededRng } from "@/lib/dispersion/stats"

const ORIGIN = { lat: 36.5685, lng: -121.949 }
const always = (v: number) => () => v // an rng that always returns v (0.5 = no spread)

/** Lies by distance north of the origin: [fromYds, lie] bands, rough before the first. */
function bands(...b: [number, Lie][]): LieMap {
  return {
    lieAt(p) {
      const y = toLocal(ORIGIN, p).y
      let lie: Lie = "rough"
      for (const [from, l] of b) if (y >= from) lie = l
      return lie
    },
  }
}

describe("clubGroup", () => {
  it("reads the club names the app uses", () => {
    expect(clubGroup("Driver")).toBe("driver")
    expect(clubGroup("3-Wood")).toBe("wood")
    expect(clubGroup("7-Wood")).toBe("wood")
    expect(clubGroup("4-Iron")).toBe("longIron")
    expect(clubGroup("7-Iron")).toBe("midIron")
    expect(clubGroup("9-Iron")).toBe("shortIron")
    expect(clubGroup("PW")).toBe("wedge")
    expect(clubGroup("56 (SW)")).toBe("wedge")
  })
})

describe("rollYds", () => {
  it("is zero in water and bunkers (and out of bounds)", () => {
    for (const lie of ["water", "bunker", "oob"] as Lie[]) expect(rollYds("Driver", lie, 260, always(0.9))).toBe(0)
  })

  it("rolls a driver much further than a wedge", () => {
    expect(rollYds("Driver", "fairway", 260, always(0.5))).toBe(BASE_ROLL_YDS.driver)
    expect(rollYds("PW", "fairway", 120, always(0.5))).toBe(BASE_ROLL_YDS.wedge)
    expect(rollYds("Driver", "fairway", 260, always(0))).toBeGreaterThan(rollYds("PW", "fairway", 120, always(1)))
  })

  it("scales by the landing lie: rough grabs it, irons check up on the green, woods don't", () => {
    expect(rollYds("Driver", "rough", 260, always(0.5))).toBeCloseTo(BASE_ROLL_YDS.driver * 0.3)
    expect(rollYds("7-Iron", "green", 160, always(0.5))).toBeCloseTo(BASE_ROLL_YDS.midIron * 0.5)
    expect(rollYds("3-Wood", "green", 230, always(0.5))).toBeCloseTo(BASE_ROLL_YDS.wood)
  })

  it("spreads each shot +-30% around the estimate", () => {
    expect(rollYds("Driver", "fairway", 260, always(0))).toBeCloseTo(14)
    expect(rollYds("Driver", "fairway", 260, always(1))).toBeCloseTo(26)
  })

  it("never rolls more than a quarter of the carry", () => {
    expect(rollYds("Driver", "fairway", 40, always(0.5))).toBe(10)
  })
})

describe("rollToRest", () => {
  it("stops in a bunker it rolls into, even though it landed on the fairway", () => {
    // Fairway from 200 yd, bunker from 265 yd: lands at 262, would roll 20.
    const lies = bands([200, "fairway"], [265, "bunker"])
    const landing = fromLocal(ORIGIN, { x: 0, y: 262 })
    const rest = rollToRest(landing, "fairway", 0, 20, lies)
    expect(rest.lie).toBe("bunker")
    expect(rest.rolledYds).toBeLessThan(5)
    expect(toLocal(ORIGIN, rest.point).y).toBeLessThan(268)
  })

  it("catches a hazard in the middle of the roll, not only at its end", () => {
    // A 3-yd strip of water at 270-273, fairway on both sides; the roll would end at 282 on fairway.
    const lies = bands([200, "fairway"], [270, "water"], [273, "fairway"])
    const rest = rollToRest(fromLocal(ORIGIN, { x: 0, y: 262 }), "fairway", 0, 20, lies)
    expect(rest.lie).toBe("water")
  })

  it("runs the full roll on open fairway", () => {
    const lies = bands([200, "fairway"])
    const rest = rollToRest(fromLocal(ORIGIN, { x: 0, y: 262 }), "fairway", 0, 20, lies)
    expect(rest.lie).toBe("fairway")
    expect(rest.rolledYds).toBe(20)
    expect(toLocal(ORIGIN, rest.point).y).toBeCloseTo(282, 1)
  })
})

describe("two-stage landings in the planner", () => {
  const shots = Array.from({ length: 100 }, (_, i) => ({ carryYds: 255 + (i % 20), offlineYds: (i % 9) - 4 }))
  const fairway = buildLieMap(ORIGIN, [
    { kind: "fairway", ring: [fromLocal(ORIGIN, { x: -30, y: 150 }), fromLocal(ORIGIN, { x: 30, y: 150 }), fromLocal(ORIGIN, { x: 30, y: 400 }), fromLocal(ORIGIN, { x: -30, y: 400 })] },
  ])

  it("is deterministic for a fixed seed", () => {
    const a = simulateLandings("Driver", shots, ORIGIN, 0, fairway, seededRng(3))
    const b = simulateLandings("Driver", shots, ORIGIN, 0, fairway, seededRng(3))
    expect(a).toEqual(b)
    const c = simulateLandings("Driver", shots, ORIGIN, 0, fairway, seededRng(4))
    expect(c.map((l) => l.totalYds)).not.toEqual(a.map((l) => l.totalYds))
  })

  it("keeps the carry point and scores the rest point: a 264 carry finishes ~280", () => {
    const pin = fromLocal(ORIGIN, { x: 0, y: 420 })
    const plan = evaluateClub({ club: "Driver", shots }, { from: ORIGIN, aim: pin, pin, lies: fairway })
    expect(plan.meanCarryYds).toBeCloseTo(264.5, 1)
    expect(plan.meanTotalYds).toBeGreaterThan(plan.meanCarryYds + 15)
    expect(plan.meanTotalYds).toBeLessThan(plan.meanCarryYds + 25)
    const landings = simulateLandings("Driver", shots, ORIGIN, 0, fairway)
    expect(landings.every((l) => toLocal(ORIGIN, l.point).y > toLocal(ORIGIN, l.carryPoint).y)).toBe(true)
  })

  it("counts the lie where shots stop: fairway landings that run into a bunker are bunker shots", () => {
    // Bunker across the fairway starting at 280 yd: the carries (255-274) all land short of it.
    const withBunker = buildLieMap(ORIGIN, [
      { kind: "fairway", ring: [fromLocal(ORIGIN, { x: -30, y: 150 }), fromLocal(ORIGIN, { x: 30, y: 150 }), fromLocal(ORIGIN, { x: 30, y: 400 }), fromLocal(ORIGIN, { x: -30, y: 400 })] },
      { kind: "bunker", ring: [fromLocal(ORIGIN, { x: -30, y: 280 }), fromLocal(ORIGIN, { x: 30, y: 280 }), fromLocal(ORIGIN, { x: 30, y: 300 }), fromLocal(ORIGIN, { x: -30, y: 300 })] },
    ])
    const pin = fromLocal(ORIGIN, { x: 0, y: 420 })
    const landings = simulateLandings("Driver", shots, ORIGIN, 0, withBunker)
    expect(landings.every((l) => l.carryLie === "fairway")).toBe(true)
    const plan = evaluateClub({ club: "Driver", shots }, { from: ORIGIN, aim: pin, pin, lies: withBunker })
    expect(plan.lieShare.bunker).toBeGreaterThan(0.3)
  })
})
