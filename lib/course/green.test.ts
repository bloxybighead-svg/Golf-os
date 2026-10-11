import { describe, expect, it } from "vitest"
import { fromLocal, type LatLng } from "./geo"
import { greenYardages, holeGreen } from "./green"
import type { CourseFeature, CourseHole } from "./overpass"

const ORIGIN = { lat: 36.5685, lng: -121.949 }
const at = (x: number, y: number): LatLng => fromLocal(ORIGIN, { x, y })

/** A rectangle 20 yd wide (x) and 30 yd deep (y) centred 150 yd north of the origin: the green's front edge is 135 yd out. */
const GREEN = [at(-10, 135), at(10, 135), at(10, 165), at(-10, 165)]

describe("greenYardages", () => {
  it("measures front, center and back along the line to the pin", () => {
    const g = greenYardages(ORIGIN, at(0, 150), GREEN)!
    expect(g.front).toBeCloseTo(135, 1)
    expect(g.center).toBeCloseTo(150, 1)
    expect(g.back).toBeCloseTo(165, 1)
  })

  it("follows the line to the pin, in through one side of the green and out the other", () => {
    const g = greenYardages(at(-100, 100), at(0, 150), GREEN)!
    const toPin = Math.hypot(100, 50)
    expect(g.center).toBeCloseTo(toPin, 1)
    expect(g.front).toBeCloseTo(toPin * 0.9, 1) // crosses x = -10 at 90% of the way to the pin
    expect(g.back).toBeCloseTo(toPin * 1.1, 1) // leaves at x = 10
  })

  it("uses the green's centroid as the center when no pin is set", () => {
    const g = greenYardages(ORIGIN, null, GREEN)!
    expect(g.center).toBeCloseTo(150, 1)
    expect(g.front).toBeCloseTo(135, 1)
  })

  it("starts the front at 0 for a ball already on the green", () => {
    const g = greenYardages(at(0, 140), at(0, 155), GREEN)!
    expect(g.front).toBe(0)
    expect(g.back).toBeCloseTo(25, 1)
  })

  it("is null with no green, and when the line misses it", () => {
    expect(greenYardages(ORIGIN, at(0, 150), null)).toBeNull()
    expect(greenYardages(ORIGIN, at(0, 150), [])).toBeNull()
    expect(greenYardages(ORIGIN, at(-200, 150), GREEN)).toBeNull()
  })
})

describe("holeGreen", () => {
  const hole: CourseHole = { id: "h", ref: 1, par: 4, line: [ORIGIN, at(0, 150)] }
  const feat = (ring: LatLng[]): CourseFeature => ({ kind: "green", ring })

  it("picks the green nearest the end of the hole", () => {
    const far = [at(300, 150), at(310, 150), at(310, 160), at(300, 160)]
    expect(holeGreen(hole, [feat(far), feat(GREEN)])).toBe(GREEN)
  })

  it("takes a green the golfer drew over the mapped one, and the last one drawn", () => {
    const drawn = [at(-8, 140), at(8, 140), at(8, 160), at(-8, 160)]
    const drawnLater = [at(-6, 142), at(6, 142), at(6, 158), at(-6, 158)]
    expect(holeGreen(hole, [feat(GREEN)], [{ id: "a", lie: "green", ring: drawn }])).toBe(drawn)
    const zones = [{ id: "a", lie: "green" as const, ring: drawn }, { id: "b", lie: "green" as const, ring: drawnLater }]
    expect(holeGreen(hole, [feat(GREEN)], zones)).toBe(drawnLater)
    expect(holeGreen(hole, [feat(GREEN)], [{ id: "c", lie: "trees", ring: drawn }])).toBe(GREEN)
  })

  it("finds a drawn green where none is mapped, so front and back measure it", () => {
    const drawn = [at(-8, 140), at(8, 140), at(8, 160), at(-8, 160)]
    const g = greenYardages(ORIGIN, at(0, 150), holeGreen(hole, [], [{ id: "a", lie: "green", ring: drawn }]))!
    expect(g.front).toBeCloseTo(140, 1)
    expect(g.back).toBeCloseTo(160, 1)
  })

  it("is null when no green is near the end of the hole", () => {
    expect(holeGreen(hole, [])).toBeNull()
    expect(holeGreen(hole, [feat([at(300, 150), at(310, 150), at(310, 160)])])).toBeNull()
  })
})
