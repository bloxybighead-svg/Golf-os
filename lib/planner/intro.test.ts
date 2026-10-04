import { describe, expect, it } from "vitest"
import { INTRO_CARDS, shouldShowIntro } from "./intro"

describe("shouldShowIntro", () => {
  it("shows to someone who hasn't seen it", () => {
    expect(shouldShowIntro({ seen: false, roundActive: false })).toBe(true)
  })
  it("never shows once seen (skip and finish both set seen)", () => {
    expect(shouldShowIntro({ seen: true, roundActive: false })).toBe(false)
  })
  it("never shows during an active round", () => {
    expect(shouldShowIntro({ seen: false, roundActive: true })).toBe(false)
  })
})

describe("INTRO_CARDS", () => {
  it("is three cards with copy", () => {
    expect(INTRO_CARDS).toHaveLength(3)
    for (const c of INTRO_CARDS) {
      expect(c.title.length).toBeGreaterThan(0)
      expect(c.body.length).toBeGreaterThan(0)
    }
  })
})
