import { describe, expect, it } from "vitest"
import { isFirstVisit } from "./firstRun"

describe("first visit", () => {
  const fresh = { hasLastCourse: false, onboarded: null, hasBaseline: false }

  it("is a device with nothing remembered and no account setup", () => {
    expect(isFirstVisit(fresh)).toBe(true)
  })
  it("is not once a course, a setup or an account baseline exists", () => {
    expect(isFirstVisit({ ...fresh, hasLastCourse: true })).toBe(false)
    expect(isFirstVisit({ ...fresh, onboarded: "1" })).toBe(false)
    expect(isFirstVisit({ ...fresh, hasBaseline: true })).toBe(false)
  })
})
