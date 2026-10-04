import { describe, expect, it } from "vitest"
import { bearingDeg, fromLocal, toLocal, type LatLng } from "@/lib/course/geo"
import { fitView, metersPerPixel, rotate, rotationForBearing, unrotate, wrapDeg } from "./orientation"

const tee: LatLng = { lat: 36.57, lng: -121.95 }
const toRad = (d: number) => (d * Math.PI) / 180
const along = (bearing: number, yds: number): LatLng => fromLocal(tee, { x: yds * Math.sin(toRad(bearing)), y: yds * Math.cos(toRad(bearing)) })

describe("rotationForBearing", () => {
  it("turns the hole's bearing to the top of the screen", () => {
    expect(rotationForBearing(0)).toBe(0)
    expect(rotationForBearing(90)).toBe(-90) // plays east: rotate counter-clockwise a quarter turn
    expect(rotationForBearing(270)).toBe(90)
    expect(Math.abs(rotationForBearing(180))).toBe(180)
    expect(wrapDeg(-190)).toBe(170)
  })
  it("a point along the bearing lands straight above the centre after rotating", () => {
    for (const bearing of [0, 35, 90, 137, 180, 222, 271, 359]) {
      const t = toRad(bearing)
      // a point 100 px along the bearing on a north-up map (x east, y down = -north)
      const p = rotate(100 * Math.sin(t), -100 * Math.cos(t), rotationForBearing(bearing))
      expect(p.x).toBeCloseTo(0, 6)
      expect(p.y).toBeCloseTo(-100, 6)
    }
  })
})

describe("unrotate (the tap/drag inverse)", () => {
  it("is the exact inverse of rotate at every angle", () => {
    for (const deg of [-180, -133, -90, -17, 0, 25, 90, 151, 180]) {
      for (const [x, y] of [[0, 0], [120, -40], [-75, 310], [1, 1]]) {
        const r = rotate(x, y, deg)
        const back = unrotate(r.x, r.y, deg)
        expect(back.x).toBeCloseTo(x, 6)
        expect(back.y).toBeCloseTo(y, 6)
      }
    }
  })
  it("a tap above the centre of a rotated map lands up the hole", () => {
    const v = unrotate(0, -100, rotationForBearing(90)) // hole plays east; 100 px up the screen
    expect(v.x).toBeCloseTo(100, 6) // east on the map
    expect(v.y).toBeCloseTo(0, 6)
  })
})

describe("fitView", () => {
  const viewport = { w: 375, h: 487 }
  it("puts every point inside the padded window at any bearing", () => {
    for (const bearing of [0, 45, 90, 200, 300]) {
      const pts = [tee, along(bearing, 400), along(bearing + 8, 200)]
      const v = fitView(pts, bearing, viewport, { padding: 36 })!
      const mpp = metersPerPixel(v.zoom, v.center.lat)
      const b = toRad(bearing)
      for (const p of pts) {
        const l = toLocal(v.center, p)
        const rx = (l.x * Math.cos(b) - l.y * Math.sin(b)) * 0.9144
        const ry = (l.x * Math.sin(b) + l.y * Math.cos(b)) * 0.9144
        expect(Math.abs(rx / mpp)).toBeLessThanOrEqual(viewport.w / 2 - 36 + 0.5)
        expect(Math.abs(ry / mpp)).toBeLessThanOrEqual(viewport.h / 2 - 36 + 0.5)
      }
    }
  })
  it("puts the tee below the green on screen", () => {
    const bearing = 120
    const green = along(bearing, 300)
    expect(bearingDeg(tee, green)).toBeCloseTo(bearing, 1)
    const v = fitView([tee, green], bearing, viewport)!
    const b = toRad(bearing)
    const up = (p: LatLng) => {
      const l = toLocal(v.center, p)
      return l.x * Math.sin(b) + l.y * Math.cos(b) // distance along the hole's direction
    }
    expect(up(green)).toBeGreaterThan(up(tee))
  })
  it("frames a short window at a lower zoom than a tall one, on half levels", () => {
    const pts = [tee, along(0, 550)]
    const tall = fitView(pts, 0, { w: 375, h: 600 })!
    const short = fitView(pts, 0, { w: 375, h: 300 })!
    expect(short.zoom).toBeLessThan(tall.zoom)
    expect((tall.zoom * 2) % 1).toBe(0)
  })
  it("returns null for nothing to frame and caps a single point's zoom", () => {
    expect(fitView([], 0, viewport)).toBeNull()
    expect(fitView([tee], 0, viewport)!.zoom).toBeLessThanOrEqual(19)
  })
})
