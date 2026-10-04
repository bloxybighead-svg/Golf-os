import { describe, expect, it } from "vitest"
import { fromLocal, type LatLng } from "@/lib/course/geo"
import type { CourseFeature, CourseHole } from "@/lib/course/overpass"
import { holeFitPoints } from "./geometry"

const o: LatLng = { lat: 36.57, lng: -121.95 }
const at = (x: number, y: number) => fromLocal(o, { x, y })
const box = (cx: number, cy: number, r: number) => [at(cx - r, cy - r), at(cx + r, cy - r), at(cx + r, cy + r), at(cx - r, cy + r)]
const hole: CourseHole = { id: "h1", ref: 1, par: 4, line: [at(0, 0), at(0, 380)] }

describe("holeFitPoints", () => {
  it("includes this hole's fairway and green but not a neighbour's", () => {
    const mine = box(0, 200, 20)
    const green = box(0, 380, 12)
    const neighbour = box(180, 200, 20) // another hole's fairway, 180 yd away
    const features: CourseFeature[] = [
      { kind: "fairway", ring: mine },
      { kind: "green", ring: green },
      { kind: "fairway", ring: neighbour },
      { kind: "bunker", ring: box(0, 200, 5) },
    ]
    const pts = holeFitPoints(hole, features, at(0, 380))
    expect(pts).toEqual(expect.arrayContaining(mine))
    expect(pts).toEqual(expect.arrayContaining(green))
    for (const p of neighbour) expect(pts).not.toContain(p)
  })
  it("catches a fairway beside the middle of a long straight segment", () => {
    const side = box(30, 190, 12)
    const pts = holeFitPoints(hole, [{ kind: "fairway", ring: side }], at(0, 380))
    expect(pts).toEqual(expect.arrayContaining(side))
  })
})
