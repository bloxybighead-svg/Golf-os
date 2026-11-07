import { describe, expect, it } from "vitest"
import { fullBagShots } from "@/lib/golfer/bagShots"
import { DEFAULT_BAG } from "@/lib/golfer/bag"
import { defaultSpreadFor, effectiveSpread } from "./spreadSetting"
import { ESTIMATE_BAG_SPREAD, ON_COURSE_SPREAD } from "./strategy"
import { pebbleH1 } from "./regressionHarness"

describe("on-course spread is per source", () => {
  it("handicap-estimate bags get 1.0; the golfer's own shots and launch-monitor data get 1.25", () => {
    expect(defaultSpreadFor("handicap")).toBe(1.0)
    expect(defaultSpreadFor("calibrated")).toBe(1.25)
    expect(defaultSpreadFor("legacy")).toBe(1.25)
    expect(ESTIMATE_BAG_SPREAD).toBe(1.0)
    expect(ON_COURSE_SPREAD).toBe(1.25) // the constant's meaning is unchanged
  })

  it("a spread the golfer set themselves applies to every source", () => {
    for (const s of ["handicap", "calibrated", "legacy"] as const) expect(effectiveSpread(s, 1.4)).toBe(1.4)
    expect(effectiveSpread("handicap", null)).toBe(1.0)
    expect(effectiveSpread("calibrated", null)).toBe(1.25)
  })

  it("the estimate-bag harness plays an estimate bag unwidened and widens it only when asked", () => {
    const base = pebbleH1(10)
    const wide = pebbleH1(10, { spread: ON_COURSE_SPREAD })
    const pen = (r: typeof base) => r.ranking.find((x) => x.club === "Driver")!.plan.lieShare.oob
    expect(pen(wide)).toBeGreaterThan(pen(base))
  })
})

describe("common random numbers", () => {
  it("every club sees the same luck: shot i is the same standard-normal draw for each club, scaled by that club's own SDs", () => {
    const bag = fullBagShots({ myBag: null, handicap: 10, typed: {}, bag: DEFAULT_BAG, seedKey: "course|7|tee" })
    const z = (club: string) => bag.find((c) => c.club === club)!.shots.slice(0, 400).map((s) => s.offlineYds / (s.carryYds || 1))
    const a = z("Driver"), b = z("7-Iron")
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length
    const cov = a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0)
    const corr = cov / Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0))
    expect(corr).toBeGreaterThan(0.9)
  })
})
