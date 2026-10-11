import { describe, expect, it } from "vitest"
import { aimText } from "./aimText"

describe("aimText", () => {
  it("on the green it is measured from the pin", () => {
    expect(aimText(-6, "green")).toBe("6 yd left of the pin")
    expect(aimText(4, "green")).toBe("4 yd right of the pin")
    expect(aimText(0.5, "green")).toBe("At the pin")
  })
  it("off the green it names the side of the fairway or rough", () => {
    expect(aimText(-12, "fairway")).toBe("Left side of the fairway")
    expect(aimText(9, "rough")).toBe("Right side of the rough")
    expect(aimText(0, "fairway")).toBe("Center of the fairway")
  })
  it("any other ground just says which way", () => {
    expect(aimText(5, "bunker")).toBe("5 yd right")
    expect(aimText(0, null)).toBe("Down the line")
  })
})
