import { describe, expect, it } from "vitest"
import { aimText } from "./aimText"

describe("aimText", () => {
  it("on the green it is measured from the pin", () => {
    expect(aimText(-6, "green")).toBe("Aim 6 yd left of the pin")
    expect(aimText(4, "green")).toBe("Aim 4 yd right of the pin")
    expect(aimText(0.5, "green")).toBe("Aim at the pin")
  })
  it("off the green it names the surface; a big offset is its edge", () => {
    expect(aimText(-12, "fairway")).toBe("Aim at the left edge of the fairway")
    expect(aimText(9, "rough")).toBe("Aim at the right edge of the rough")
    expect(aimText(-4, "fairway")).toBe("Aim 4 yd left of the middle of the fairway")
    expect(aimText(0, "fairway")).toBe("Aim down the middle of the fairway")
  })
  it("any other ground just says which way", () => {
    expect(aimText(5, "bunker")).toBe("Aim 5 yd right")
    expect(aimText(0, null)).toBe("Aim down the line")
  })
})
