import { describe, expect, it } from "vitest"
import { fullBagShots, meanCarry, typedCarries } from "@/lib/golfer/bagShots"
import type { ClubFit } from "@/lib/golfer/shotProfile"
import { generateMyBag } from "@/lib/golfer/shotProfile"
import { BAG_ORDER, DEFAULT_PROFILES, profilesForHandicap, type Club } from "@/lib/golfer/tables"
import { CLOSE_GAP_YDS, WIDE_GAP_YDS, buildBagNumbers, gapNotes, sourceLabel } from "./bagNumbers"

const BAG: Club[] = ["Driver", "3-Wood", "7-Iron", "PW"]
const fit = (club: Club, n: number, mean: number): ClubFit => ({
  club,
  nShots: n,
  sessionsUsed: 1,
  matIndoorOnly: false,
  profile: { mean_carry: mean, distance_cv: 0.03, direction_sd_deg: 3, start_line_bias_deg: 0, start_line_sd_deg: 2, curve_bias_pct: 0, curve_sd_pct: 0.01, curve_carry_slope: -0.2, n_shots: n },
})

describe("source tag", () => {
  const rows = buildBagNumbers({ bag: BAG, fits: [fit("7-Iron", 40, 150)], handicap: 10, accountHandicap: null, typed: { Driver: 250 } })
  const by = (club: Club) => rows.find((r) => r.club === club)!

  it("says Your number for a typed carry, Your shots (n) for a fitted club, Typical for the rest", () => {
    expect(sourceLabel(by("Driver"))).toBe("Your number")
    expect(sourceLabel(by("7-Iron"))).toBe("Your shots (40)")
    expect(sourceLabel(by("PW"))).toBe("Typical")
  })

  it("lets shots the golfer hit outrank a typed number", () => {
    const r = buildBagNumbers({ bag: BAG, fits: [fit("7-Iron", 40, 150)], handicap: 10, accountHandicap: null, typed: { "7-Iron": 160 } })
    expect(r.find((x) => x.club === "7-Iron")).toMatchObject({ source: "shots", nShots: 40 })
    expect(r.find((x) => x.club === "7-Iron")!.carryYds).toBeCloseTo(150, -1)
  })

  it("leans a thin club on the typed number by how few shots there are", () => {
    const at = (n: number) => buildBagNumbers({ bag: BAG, fits: [fit("7-Iron", n, 150)], handicap: 10, accountHandicap: null, typed: { "7-Iron": 170 } }).find((x) => x.club === "7-Iron")!.carryYds
    expect(at(3)).toBeGreaterThan(at(10))
    expect(at(10)).toBeGreaterThan(at(14) - 1)
    expect(at(3)).toBeGreaterThan(160) // 3 of 15 shots: mostly the typed 170
    expect(at(14)).toBeLessThan(155)
  })

  it("plays a club with no shots at exactly its typed carry, even beside clubs that have shots", () => {
    const r = buildBagNumbers({ bag: BAG, fits: [fit("7-Iron", 40, 150)], handicap: 10, accountHandicap: null, typed: { PW: 118 } })
    expect(r.find((x) => x.club === "PW")).toMatchObject({ source: "typed", carryYds: 118 })
  })

  it("uses the typed carry exactly, and lists the bag longest first", () => {
    expect(by("Driver").carryYds).toBe(250)
    expect(rows.map((r) => r.club)).toEqual(BAG)
  })

  it("adds roll to the total for Driver and 3-Wood only", () => {
    expect(by("Driver").totalYds).toBe(250 + 20)
    expect(by("3-Wood").totalYds).toBe(by("3-Wood").carryYds + 12)
    expect(by("PW").totalYds).toBe(by("PW").carryYds)
  })
})

describe("the numbers are the planner's", () => {
  const typed = typedCarries("255", "", { PW: 120 })

  it("show the mean of the planner's own shots, whatever the tendency", () => {
    const planner = fullBagShots({ myBag: null, handicap: 8, typed, tendency: { side: "right", strength: "strong" }, bag: BAG })
    const rows = buildBagNumbers({ bag: BAG, fits: null, handicap: 8, accountHandicap: null, typed })
    for (const c of planner) expect(rows.find((r) => r.club === c.club)!.carryYds).toBe(Math.round(meanCarry(c.shots)))
  })

  it("show the mean of the golfer's own generated bag when they have shots", () => {
    const fits = [fit("Driver", 60, 240), fit("7-Iron", 40, 150)]
    const mine = generateMyBag(fits, BAG, 8)
    const rows = buildBagNumbers({ bag: BAG, fits, handicap: 20, accountHandicap: 8, typed: {} })
    for (const c of mine.clubs) expect(rows.find((r) => r.club === c.club)!.carryYds).toBe(Math.round(meanCarry(c.shots)))
  })

  it("play a typed carry at exactly that mean when the club has no shots", () => {
    const fits = [fit("7-Iron", 40, 150)]
    for (const f of [null, fits]) {
      const typed = { PW: 118 }
      const shots = fullBagShots({ myBag: f ? generateMyBag(f, BAG, 8, undefined, undefined, typed) : null, handicap: 8, typed, bag: BAG })
      expect(meanCarry(shots.find((c) => c.club === "PW")!.shots)).toBeCloseTo(118, 6)
    }
  })

  it("ignore a typed driver outside the range the planner accepts", () => {
    expect(typedCarries("100", "", {}).Driver).toBeUndefined()
    expect(typedCarries("250", "150", {})).toEqual({ Driver: 250, "7-Iron": 150 })
  })
})

describe("hybrids", () => {
  it("sit between the 7-Wood and the 4-Iron, longest first, at every handicap", () => {
    for (const h of [0, 8, 15, 24]) {
      const p = profilesForHandicap(h)
      expect(p["7-Wood"].mean_carry).toBeGreaterThan(p["3-Hybrid"].mean_carry)
      expect(p["3-Hybrid"].mean_carry).toBeGreaterThan(p["4-Hybrid"].mean_carry)
      expect(p["4-Hybrid"].mean_carry).toBeGreaterThan(p["4-Iron"].mean_carry)
    }
  })

  it("are in the catalog between the 7-Wood and the 4-Iron, with a full profile", () => {
    expect(BAG_ORDER.slice(BAG_ORDER.indexOf("7-Wood"), BAG_ORDER.indexOf("4-Iron") + 1)).toEqual(["7-Wood", "3-Hybrid", "4-Hybrid", "4-Iron"])
    for (const c of ["3-Hybrid", "4-Hybrid"] as const) {
      expect(DEFAULT_PROFILES.mid_handicap[c].direction_sd_deg).toBeGreaterThan(0)
      expect(DEFAULT_PROFILES.mid_handicap[c].distance_cv).toBeGreaterThan(0)
    }
  })
})

describe("gapNotes", () => {
  const rows = (...carries: number[]) => carries.map((carryYds, i) => ({ club: (["4-Iron", "5-Iron", "6-Iron"] as Club[])[i], carryYds }))

  it("flags neighbours within 6 yd and gaps over 20 yd, nothing in between", () => {
    expect(gapNotes(rows(180, 175))).toHaveLength(1) // 5 yd
    expect(gapNotes(rows(180, 180 - CLOSE_GAP_YDS))).toHaveLength(1) // exactly 6: within
    expect(gapNotes(rows(180, 180 - CLOSE_GAP_YDS - 1))).toHaveLength(0) // 7
    expect(gapNotes(rows(180, 180 - WIDE_GAP_YDS))).toHaveLength(0) // exactly 20: fine
    expect(gapNotes(rows(180, 180 - WIDE_GAP_YDS - 1))).toHaveLength(1) // 21
  })

  it("names the pair and the size, and checks every neighbour pair once", () => {
    const notes = gapNotes(rows(200, 197, 170))
    expect(notes).toEqual([
      { upper: "4-Iron", lower: "5-Iron", text: "3 yd apart" },
      { upper: "5-Iron", lower: "6-Iron", text: "27 yd gap" },
    ])
  })

  it("flags a club that carries past the one above it", () => {
    expect(gapNotes(rows(170, 175))[0].text).toBe("5-Iron carries past 4-Iron")
  })
})
