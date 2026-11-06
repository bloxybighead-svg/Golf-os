import { describe, expect, it, vi } from "vitest"
import { carryConflicts, repairCarries } from "./carryOrder"
import { fullBagShots, meanCarry, typedCarries } from "./bagShots"
import { SETTINGS_KEY } from "./baseline"
import { readDeviceBag, writeClubCarry, writeWedgeCarries } from "@/lib/you/deviceBag"
import { DEFAULT_BAG } from "./bag"
import { BAG_ORDER, profilesForHandicap, scaleProfilesToCarries, type Club } from "./tables"

const decreasing = (carries: Record<string, number>) => {
  const list = BAG_ORDER.map((c) => ({ c, v: carries[c] })).filter((x) => x.v != null)
  for (let i = 1; i < list.length; i++) expect(list[i].v, `${list[i - 1].c} ${list[i - 1].v} -> ${list[i].c} ${list[i].v}`).toBeLessThan(list[i - 1].v)
}
const means = (typed: Partial<Record<Club, number>>, hcp: number) =>
  Object.fromEntries(Object.entries(scaleProfilesToCarries(profilesForHandicap(hcp), typed)).map(([c, p]) => [c, p.mean_carry]))

describe("carries are ordered", () => {
  it("every handicap tier's own carries fall strictly from Driver to LW", () => {
    for (let h = -5; h <= 40; h += 0.5) decreasing(Object.fromEntries(BAG_ORDER.map((c) => [c, profilesForHandicap(h)[c].mean_carry])))
  })

  it("so do bags built from entered carries, whatever the handicap", () => {
    const cases: Partial<Record<Club, number>>[] = [
      { Driver: 230, "7-Iron": 140 }, // the reported case
      { Driver: 300, "7-Iron": 200 },
      { Driver: 180, "7-Iron": 100 },
      { Driver: 250 },
      { "7-Iron": 165 },
      { Driver: 230, "7-Iron": 140, "5-Wood": 205, "PW": 120 },
    ]
    for (const typed of cases) for (const h of [0, 5, 10, 15, 20, 28, 36]) decreasing(means(typed, h))
  })

  it("the handicap never changes a carry in an entered bag: it sets dispersion only", () => {
    for (const typed of [{ Driver: 230, "7-Iron": 140 }, { "7-Iron": 150 }, { Driver: 260, "7-Iron": 160, PW: 125 }] as Partial<Record<Club, number>>[]) {
      const base = means(typed, 0)
      for (const h of [4, 10, 20, 36]) expect(means(typed, h), `typed ${JSON.stringify(typed)} at ${h}`).toEqual(base)
      const lo = scaleProfilesToCarries(profilesForHandicap(0), typed)
      const hi = scaleProfilesToCarries(profilesForHandicap(36), typed)
      expect(hi["8-Iron"].direction_sd_deg).toBeGreaterThan(lo["8-Iron"].direction_sd_deg) // the dispersion still follows the handicap
    }
  })

  it("Driver 230 and 7-Iron 140 at 20 handicap: sampled shots come out in order too", () => {
    const bag = fullBagShots({ myBag: null, handicap: 20, typed: { Driver: 230, "7-Iron": 140 }, bag: DEFAULT_BAG })
    decreasing(Object.fromEntries(bag.map((c) => [c.club, meanCarry(c.shots)])))
    expect(meanCarry(bag.find((c) => c.club === "Driver")!.shots)).toBeCloseTo(230, -1)
  })
})

describe("repairCarries", () => {
  it("the saved account row that showed the 8-Iron carrying past the 7-Iron: drops the 3 contradicting fields", () => {
    const saved = { GW: 121, LW: 88, PW: 132, SW: 102, "3-Wood": 240, "4-Iron": 195, "6-Iron": 178, "7-Wood": 225, "8-Iron": 155, "9-Iron": 143 } as Partial<Record<Club, number>>
    const r = repairCarries("230", "140", saved)
    expect(r.dropped).toEqual(["3-Wood", "8-Iron", "9-Iron"]) // 240 > Driver 230; 155 and 143 > 7-Iron 140
    expect(r.extras).toEqual({ "7-Wood": 225, "4-Iron": 195, "6-Iron": 178, PW: 132, GW: 121, SW: 102, LW: 88 })
    decreasing({ Driver: 230, ...r.extras, "7-Iron": 140 })
  })

  it("leaves consistent carries alone, and ignores a blank Driver or 7-Iron", () => {
    const ok = { "5-Wood": 200, "6-Iron": 150, PW: 110 } as Partial<Record<Club, number>>
    expect(repairCarries("240", "140", ok)).toEqual({ extras: ok, dropped: [] })
    expect(repairCarries("", "", ok)).toEqual({ extras: ok, dropped: [] })
    expect(repairCarries("", "", { "5-Wood": 140, "3-Wood": 150 }).dropped).toEqual([]) // in order
    expect(repairCarries("", "", { "5-Wood": 150, "3-Wood": 140 }).dropped).toEqual(["5-Wood"]) // the 5-wood is not shorter than the 3-wood before it
  })
})

describe("carryConflicts", () => {
  it("words each excluded club against the club it contradicts", () => {
    const saved = { "3-Wood": 240, "8-Iron": 155, "9-Iron": 143, "6-Iron": 178 } as Partial<Record<Club, number>>
    const c = carryConflicts("230", "140", saved)
    expect(c.map((x) => x.text)).toEqual(["3-Wood (240) is longer than Driver (230)", "8-Iron (155) is longer than 7-Iron (140)", "9-Iron (143) is longer than 7-Iron (140)"].map((t) => t))
  })
  it("a shorter-than case", () => {
    expect(carryConflicts("", "140", { "4-Iron": 120 }).map((x) => x.text)).toEqual(["4-Iron (120) is shorter than 7-Iron (140)"])
  })
})

describe("storage is never rewritten by the exclusion", () => {
  it("typedCarries leaves contradicting clubs out of the simulation, and the caller's saved object is unchanged", () => {
    const saved = { "3-Wood": 240, "8-Iron": 155, PW: 132 } as Partial<Record<Club, number>>
    const before = JSON.stringify(saved)
    const t = typedCarries("230", "140", saved)
    expect(t).toEqual({ PW: 132, Driver: 230, "7-Iron": 140 })
    expect(JSON.stringify(saved)).toBe(before)
  })
  it("loading a contradicting bag and saving an unrelated setting keeps every stored carry", () => {
    const store: Record<string, string> = {}
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] })
    const carries = { "3-Wood": 240, "8-Iron": 155, "9-Iron": 143, PW: 132 }
    store[SETTINGS_KEY] = JSON.stringify({ driverCarry: "230", sevenIronCarry: "140", carries, handicap: 20 })
    const bag = readDeviceBag("handicap")
    expect(bag.carries).toMatchObject(carries) // read back whole
    writeWedgeCarries({}) // an unrelated setting
    writeClubCarry("PW", 130) // another club's edit
    expect(JSON.parse(store[SETTINGS_KEY]).carries).toEqual({ ...carries, PW: 130 })
    writeClubCarry("8-Iron", null) // the one-tap fix clears only that club
    expect(JSON.parse(store[SETTINGS_KEY]).carries).not.toHaveProperty("8-Iron")
    expect(JSON.parse(store[SETTINGS_KEY]).carries["3-Wood"]).toBe(240)
    vi.unstubAllGlobals()
  })
})
