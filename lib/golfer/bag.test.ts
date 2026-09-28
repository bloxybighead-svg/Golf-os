import { describe, it, expect } from "vitest"
import { CALIBRATED_DEFAULT_BAG, DEFAULT_BAG, canonicalClub, fillBag, normalizeBag } from "./bag"
import { referenceCarry } from "./tables"
import { generateCustomGolferShots } from "./build"

const shots = (carry: number, offline = 0, n = 4) => Array.from({ length: n }, () => ({ carryYds: carry, offlineYds: offline }))

// Dillon's calibrated clubs as stored: no 4-iron or 9-iron.
const DILLON = [
  { club: "Driver", shots: shots(264, 10) },
  { club: "3-Wood", shots: shots(243.5) },
  { club: "7-Wood", shots: shots(212.2) },
  { club: "5-Iron", shots: shots(182.1, 6) },
  { club: "6-Iron", shots: shots(172.6) },
  { club: "7-Iron", shots: shots(162.5) },
  { club: "8-Iron", shots: shots(147.8, 5) },
  { club: "PW", shots: shots(124) },
  { club: "GW", shots: shots(117.4) },
  { club: "56 (SW)", shots: shots(98.2) },
  { club: "60 (LW)", shots: shots(89.1) },
]

describe("bags", () => {
  it("default bags hold the clubs asked for", () => {
    expect(DEFAULT_BAG).toEqual(["Driver", "3-Wood", "5-Iron", "6-Iron", "7-Iron", "8-Iron", "9-Iron", "PW", "GW", "SW", "LW"])
    expect(CALIBRATED_DEFAULT_BAG).toHaveLength(13)
    expect(CALIBRATED_DEFAULT_BAG).toEqual(expect.arrayContaining(["4-Iron", "9-Iron", "7-Wood", "3-Wood", "Driver", "PW", "GW", "SW", "LW"]))
  })

  it("maps stored wedge names onto the catalog", () => {
    expect(canonicalClub("56 (SW)")).toBe("SW")
    expect(canonicalClub("60 (LW)")).toBe("LW")
    expect(canonicalClub("7-Iron")).toBe("7-Iron")
    expect(canonicalClub("Hybrid")).toBeNull()
  })

  it("normalizeBag drops unknown names and duplicates and sorts longest first", () => {
    expect(normalizeBag(["PW", "Driver", "Putter", "PW", "7-Iron"])).toEqual(["Driver", "7-Iron", "PW"])
  })
})

describe("fillBag", () => {
  const bag = fillBag(DILLON, CALIBRATED_DEFAULT_BAG)

  it("returns every club in the bag, in bag order, keeping the golfer's own labels", () => {
    expect(bag.map((b) => b.club)).toEqual([
      "Driver", "3-Wood", "7-Wood", "4-Iron", "5-Iron", "6-Iron", "7-Iron", "8-Iron", "9-Iron", "PW", "GW", "56 (SW)", "60 (LW)",
    ])
  })

  it("measured clubs are untouched and not marked estimated", () => {
    const d = bag.find((b) => b.club === "Driver")!
    expect(d.estimatedFrom).toBeUndefined()
    expect(d.shots[0]).toEqual({ carryYds: 264, offlineYds: 10 })
  })

  it("estimates the 9-iron from the 8-iron and the 4-iron from the 5-iron by the typical carry ratio", () => {
    const nine = bag.find((b) => b.club === "9-Iron")!
    const four = bag.find((b) => b.club === "4-Iron")!
    expect(nine.estimatedFrom).toBe("8-Iron")
    expect(four.estimatedFrom).toBe("5-Iron")
    const r9 = referenceCarry("9-Iron") / referenceCarry("8-Iron")
    expect(nine.shots[0].carryYds).toBeCloseTo(147.8 * r9, 6)
    expect(nine.shots[0].offlineYds).toBeCloseTo(5 * r9, 6) // same miss angle
    // Lands between its neighbours, as a real 9-iron should.
    expect(nine.shots[0].carryYds).toBeLessThan(147.8)
    expect(nine.shots[0].carryYds).toBeGreaterThan(124)
    expect(four.shots[0].carryYds).toBeGreaterThan(182.1)
    expect(four.shots[0].carryYds).toBeLessThan(212.2)
  })

  it("leaves out clubs that aren't in the bag", () => {
    const small = fillBag(DILLON, ["Driver", "PW"])
    expect(small.map((b) => b.club)).toEqual(["Driver", "PW"])
  })

  it("returns nothing when there is no measured data at all", () => {
    expect(fillBag([], DEFAULT_BAG)).toEqual([])
  })
})

describe("handicap golfer covers the whole catalog", () => {
  it("generates a 7-wood between the 5-wood and 4-iron and a lob wedge short of the sand wedge", () => {
    const out = generateCustomGolferShots({ handicapIndex: 10 }, 6000, 9, ["5-Wood", "7-Wood", "4-Iron", "SW", "LW"])
    const mean = (c: string) => {
      const xs = out.filter((s) => s.club === c && !s.isMishit).map((s) => s.carryYds)
      return xs.reduce((a, b) => a + b, 0) / xs.length
    }
    expect(mean("7-Wood")).toBeLessThan(mean("5-Wood"))
    expect(mean("7-Wood")).toBeGreaterThan(mean("4-Iron"))
    expect(mean("LW")).toBeLessThan(mean("SW"))
    expect(mean("SW") - mean("LW")).toBeGreaterThan(8)
  })
})
