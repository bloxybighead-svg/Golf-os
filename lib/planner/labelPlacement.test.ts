import { describe, expect, it } from "vitest"
import { fromLocal, toLocal, type LatLng } from "@/lib/course/geo"
import { distanceToRingYds, LABEL_CLEARANCE_PX, placeLabel } from "./labelPlacement"

const origin: LatLng = { lat: 36.57, lng: -121.95 }
const at = (x: number, y: number) => fromLocal(origin, { x, y })
const square = (cx: number, cy: number, r: number) => [at(cx - r, cy - r), at(cx + r, cy - r), at(cx + r, cy + r), at(cx - r, cy + r)]

describe("distanceToRingYds", () => {
  it("is 0 inside and the edge distance outside", () => {
    const g = square(0, 0, 10)
    expect(distanceToRingYds(at(0, 0), g)).toBe(0)
    expect(distanceToRingYds(at(25, 0), g)).toBeCloseTo(15, 1)
  })
})

describe("placeLabel", () => {
  const ypp = 0.5 // yards per pixel
  const need = LABEL_CLEARANCE_PX * ypp

  it("keeps the midpoint when nothing is in the way", () => {
    const a = at(0, 0)
    const b = at(0, 100)
    const p = placeLabel(a, b, { rings: [], points: [] }, ypp)
    expect(toLocal(a, p).y).toBeCloseTo(50, 0)
  })

  it("moves a label that would sit on the green", () => {
    const a = at(0, 0)
    const pin = at(0, 100)
    const green = square(0, 85, 18) // the middle of a-to-pin (y = 50) is not on it, so put the green over the middle instead
    const onMiddle = square(0, 50, 18)
    const avoid = { rings: [onMiddle], points: [pin] }
    const p = placeLabel(a, pin, avoid, ypp)
    expect(distanceToRingYds(p, onMiddle)).toBeGreaterThanOrEqual(need - 0.5)
    expect(green.length).toBe(4)
  })

  it("keeps clear of the pin and the green when the whole line ends on the green", () => {
    const aim = at(0, 40)
    const pin = at(2, 60)
    const green = square(0, 60, 15)
    const p = placeLabel(aim, pin, { rings: [green], points: [pin] }, ypp)
    expect(distanceToRingYds(p, green)).toBeGreaterThanOrEqual(need - 0.5)
    const l = toLocal(pin, p)
    expect(Math.hypot(l.x, l.y)).toBeGreaterThanOrEqual(need - 0.5)
  })

  it("asks for more yards of room when zoomed out", () => {
    const a = at(0, 0)
    const b = at(0, 100)
    const green = square(0, 50, 12)
    const near = placeLabel(a, b, { rings: [green], points: [] }, 0.25)
    const far = placeLabel(a, b, { rings: [green], points: [] }, 1)
    expect(distanceToRingYds(far, green)).toBeGreaterThan(distanceToRingYds(near, green) - 0.5)
  })
})
