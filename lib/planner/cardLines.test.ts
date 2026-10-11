import { describe, expect, it } from "vitest"
import { otherOption, playsShown, riskLine, strategyLabel } from "./cardLines"

const shares = (oob: number, water = 0, trees = 0) => ({ lieShare: { oob, water, trees } })

describe("riskLine", () => {
  it("is hidden at 1% or less", () => {
    expect(riskLine(shares(0))).toBeNull()
    expect(riskLine(shares(0.01, 0.01, 0.01))).toBeNull()
  })
  it("names only the largest category", () => {
    expect(riskLine(shares(0.03, 0.02, 0.01))).toEqual({ text: "3% OB", warn: false })
    expect(riskLine(shares(0.02, 0.08, 0.03))).toEqual({ text: "8% water", warn: true })
    expect(riskLine(shares(0, 0, 0.12))).toEqual({ text: "12% trees", warn: true })
  })
  it("warns only above 5%", () => {
    expect(riskLine(shares(0.05))?.warn).toBe(false)
    expect(riskLine(shares(0.051))?.warn).toBe(true)
  })
})

describe("playsShown", () => {
  it("shows plays only when it differs by 2 yd or more", () => {
    expect(playsShown(151, 151.4)).toBeNull()
    expect(playsShown(151, 152.9)).toBeNull()
    expect(playsShown(151, 153)).toBe(153)
    expect(playsShown(151, 146)).toBe(146)
    expect(playsShown(151, null)).toBeNull()
  })
})

describe("strategyLabel and otherOption", () => {
  type C = { club: string; strategy?: "smart" | "go" }
  const smart: C = { club: "7-Iron" }
  const go: C = { club: "6-Iron" }
  const options = { safer: smart, lowest: go, same: false }
  it("labels the chosen option only when the two differ", () => {
    expect(strategyLabel(options, smart)).toBe("Smart play")
    expect(strategyLabel(options, { ...go, strategy: "go" } as C)).toBe("Go for it")
    expect(strategyLabel(options, { club: "PW" })).toBeNull()
    expect(strategyLabel({ ...options, same: true }, smart)).toBeNull()
  })
  it("measures against the best club, else the other option", () => {
    expect(otherOption(options, { club: "PW" }, smart)).toBe(smart)
    expect(otherOption(options, smart, smart)).toBe(go)
    expect(otherOption({ ...options, same: true }, smart, smart)).toBeNull()
  })
})
