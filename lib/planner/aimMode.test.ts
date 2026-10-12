import { describe, expect, it } from "vitest"
import { AUTO_AIM, aimFor, aimReducer } from "./aimMode"

const best = { lat: 1, lng: 1 }
const dragged = { lat: 2, lng: 2 }
const fallback = { lat: 3, lng: 3 }

describe("aim mode", () => {
  it("starts in auto", () => {
    expect(AUTO_AIM.mode).toBe("auto")
  })

  it("a drag or tap makes it manual and keeps the point", () => {
    const s = aimReducer(AUTO_AIM, { type: "drag", point: dragged })
    expect(s).toEqual({ mode: "manual", point: dragged })
    expect(aimFor(s, best, fallback)).toEqual(dragged)
  })

  it("a hole, ball, club or round change resets manual to auto", () => {
    const manual = aimReducer(AUTO_AIM, { type: "drag", point: dragged })
    expect(aimReducer(manual, { type: "reset" })).toEqual(AUTO_AIM)
  })

  it("in auto, a new ranking moves the aim to the chosen club's best aim", () => {
    const next = { lat: 9, lng: 9 }
    expect(aimFor(AUTO_AIM, best, fallback)).toEqual(best)
    expect(aimFor(AUTO_AIM, next, fallback)).toEqual(next)
  })

  it("in manual, a new ranking leaves the aim where the golfer put it", () => {
    const manual = aimReducer(AUTO_AIM, { type: "drag", point: dragged })
    expect(aimFor(manual, { lat: 9, lng: 9 }, fallback)).toEqual(dragged)
  })

  it("with no ranking yet, auto uses the default aim", () => {
    expect(aimFor(AUTO_AIM, null, fallback)).toEqual(fallback)
  })
})
