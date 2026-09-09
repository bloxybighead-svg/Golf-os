import { describe, it, expect } from "vitest"
import { profilesForHandicap, scaleProfilesToCarries, mishitRateForHandicap, DEFAULT_PROFILES } from "./tables"

describe("profilesForHandicap", () => {
  it("matches the pro tier exactly at handicap 0 (its anchor)", () => {
    const result = profilesForHandicap(0)
    expect(result.Driver.mean_carry).toBeCloseTo(DEFAULT_PROFILES.pro.Driver.mean_carry, 5)
    expect(result.Driver.distance_cv).toBeCloseTo(DEFAULT_PROFILES.pro.Driver.distance_cv, 5)
    expect(result.Driver.direction_sd_deg).toBeCloseTo(DEFAULT_PROFILES.pro.Driver.direction_sd_deg, 5)
  })

  it("interpolates between anchors for a handicap in between", () => {
    const at3 = profilesForHandicap(3) // between pro(0) and low_handicap(6)
    expect(at3.Driver.mean_carry).toBeGreaterThan(DEFAULT_PROFILES.low_handicap.Driver.mean_carry)
    expect(at3.Driver.mean_carry).toBeLessThan(DEFAULT_PROFILES.pro.Driver.mean_carry)
  })

  it("clamps outside [-4, 24] instead of extrapolating", () => {
    expect(profilesForHandicap(30).Driver.mean_carry).toBeCloseTo(DEFAULT_PROFILES.high_handicap.Driver.mean_carry, 5)
    expect(profilesForHandicap(-10).Driver.mean_carry).toBeCloseTo(DEFAULT_PROFILES.tour.Driver.mean_carry, 5)
  })

  it("7-iron carry roughly matches the file's own worked example (~165 at pro tier)", () => {
    expect(profilesForHandicap(0)["7-Iron"].mean_carry).toBeCloseTo(165, 0)
  })
})

describe("scaleProfilesToCarries", () => {
  it("gives named clubs their exact entered value", () => {
    const base = profilesForHandicap(8)
    const scaled = scaleProfilesToCarries(base, { Driver: 260, "7-Iron": 155 })
    expect(scaled.Driver.mean_carry).toBe(260)
    expect(scaled["7-Iron"].mean_carry).toBe(155)
  })

  it("rescales unnamed clubs proportionally rather than leaving them at tier defaults", () => {
    const base = profilesForHandicap(8)
    const scaled = scaleProfilesToCarries(base, { Driver: base.Driver.mean_carry * 1.2 })
    // a longer-than-tier driver should pull other clubs longer too
    expect(scaled["6-Iron"].mean_carry).toBeGreaterThan(base["6-Iron"].mean_carry)
  })

  it("leaves dispersion shape (distance_cv, direction_sd_deg) untouched", () => {
    const base = profilesForHandicap(8)
    const scaled = scaleProfilesToCarries(base, { Driver: 300 })
    expect(scaled["7-Iron"].distance_cv).toBe(base["7-Iron"].distance_cv)
    expect(scaled["7-Iron"].direction_sd_deg).toBe(base["7-Iron"].direction_sd_deg)
  })
})

describe("mishitRateForHandicap", () => {
  it("matches the anchor points from MISHIT_RATE_ANCHORS", () => {
    expect(mishitRateForHandicap(0)).toBeCloseTo(0.03, 3)
    expect(mishitRateForHandicap(24)).toBeCloseTo(0.08, 3)
  })

  it("increases with handicap", () => {
    expect(mishitRateForHandicap(20)).toBeGreaterThan(mishitRateForHandicap(2))
  })
})
