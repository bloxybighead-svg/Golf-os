import { describe, expect, it } from "vitest"
import { parseDeviceBag } from "./deviceBag"

describe("parseDeviceBag", () => {
  it("falls back to the default source and its default bag on a fresh device", () => {
    const h = parseDeviceBag(null, null, "handicap")
    expect(h.source).toBe("handicap")
    expect(h.bag).toHaveLength(11)
    // The golfer's own shots: the default bag plus every club they have data for.
    const c = parseDeviceBag(null, null, "calibrated", ["4-Iron", "7-Wood", "PW"])
    expect(c.source).toBe("calibrated")
    expect(c.bag).toHaveLength(13)
    expect(c.bag).toContain("4-Iron")
  })

  it("reads the saved bag, carries and last course", () => {
    const settings = JSON.stringify({
      source: "handicap",
      sourceV: 2,
      handicap: 8,
      driverCarry: "245",
      sevenIronCarry: "150",
      carries: { PW: 120, Nonsense: 5 },
      bags: { handicap: ["PW", "Driver", "7-Iron"] },
    })
    const last = JSON.stringify({ course: { id: "c1", name: "Home GC", city: null, state: null, par: 72, lat: 1, lng: 2 }, holeId: null })
    const d = parseDeviceBag(settings, last, "calibrated")
    expect(d.source).toBe("handicap")
    expect(d.bag).toEqual(["Driver", "7-Iron", "PW"]) // normalized to bag order
    expect(d.carries).toEqual({ Driver: 245, "7-Iron": 150, PW: 120 })
    expect(d.handicap).toBe(8)
    expect(d.course?.name).toBe("Home GC")
  })

  it("ignores a saved source from before the source version, as Play does", () => {
    const d = parseDeviceBag(JSON.stringify({ source: "handicap", bags: { handicap: ["Driver"] } }), null, "calibrated")
    expect(d.source).toBe("calibrated")
  })

  it("survives unreadable storage", () => {
    const d = parseDeviceBag("{not json", "also not", "handicap")
    expect(d.bag.length).toBeGreaterThan(0)
    expect(d.course).toBeNull()
  })
})
