import { describe, expect, it } from "vitest"
import { bearingDeg, distanceYds, fromLocal, landingPoint, lineLengthYds, pointAlongLine, pointInRing, toLocal } from "./geo"
import { buildLieMap } from "./lies"
import { parseOverpass, type OverpassElement } from "./overpass"
import { expectedStrokesRemaining } from "./cost"
import { bestAim, rankClubs } from "./plan"

const ORIGIN = { lat: 36.5685, lng: -121.949 }

function squareAround(center: { lat: number; lng: number }, halfYds: number) {
  return [
    fromLocal(center, { x: -halfYds, y: -halfYds }),
    fromLocal(center, { x: halfYds, y: -halfYds }),
    fromLocal(center, { x: halfYds, y: halfYds }),
    fromLocal(center, { x: -halfYds, y: halfYds }),
  ]
}

describe("geo", () => {
  it("round-trips local projection", () => {
    const p = fromLocal(ORIGIN, { x: 120, y: -75 })
    const back = toLocal(ORIGIN, p)
    expect(back.x).toBeCloseTo(120, 3)
    expect(back.y).toBeCloseTo(-75, 3)
  })

  it("measures 100 yards north as 100 yards, bearing 0", () => {
    const p = fromLocal(ORIGIN, { x: 0, y: 100 })
    expect(distanceYds(ORIGIN, p)).toBeCloseTo(100, 3)
    expect(bearingDeg(ORIGIN, p)).toBeCloseTo(0, 3)
  })

  it("bearing east is 90, south 180, west 270", () => {
    expect(bearingDeg(ORIGIN, fromLocal(ORIGIN, { x: 50, y: 0 }))).toBeCloseTo(90, 3)
    expect(bearingDeg(ORIGIN, fromLocal(ORIGIN, { x: 0, y: -50 }))).toBeCloseTo(180, 3)
    expect(bearingDeg(ORIGIN, fromLocal(ORIGIN, { x: -50, y: 0 }))).toBeCloseTo(270, 3)
  })

  it("puts a right miss to the golfer's right for any aim direction", () => {
    // Aiming north, +10 offline lands 10 yd east (right).
    const n = toLocal(ORIGIN, landingPoint(ORIGIN, 0, 150, 10))
    expect(n.x).toBeCloseTo(10, 2)
    expect(n.y).toBeCloseTo(150, 2)
    // Aiming east, right is south.
    const e = toLocal(ORIGIN, landingPoint(ORIGIN, 90, 150, 10))
    expect(e.x).toBeCloseTo(150, 2)
    expect(e.y).toBeCloseTo(-10, 2)
    // Aiming south, right is west.
    const s = toLocal(ORIGIN, landingPoint(ORIGIN, 180, 150, 10))
    expect(s.x).toBeCloseTo(-10, 2)
    expect(s.y).toBeCloseTo(-150, 2)
  })

  it("walks along a dogleg polyline", () => {
    const corner = fromLocal(ORIGIN, { x: 0, y: 200 })
    const end = fromLocal(corner, { x: 100, y: 0 })
    const line = [ORIGIN, corner, end]
    expect(lineLengthYds(line)).toBeCloseTo(300, 2)
    const p = toLocal(ORIGIN, pointAlongLine(line, 250))
    expect(p.x).toBeCloseTo(50, 2)
    expect(p.y).toBeCloseTo(200, 2)
    expect(pointAlongLine(line, 9999)).toEqual(end)
  })

  it("point in ring", () => {
    const ring = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    expect(pointInRing(5, 5, ring)).toBe(true)
    expect(pointInRing(15, 5, ring)).toBe(false)
  })
})

describe("parseOverpass", () => {
  const pts = squareAround(ORIGIN, 10).map((p) => ({ lat: p.lat, lon: p.lng }))
  const elements: OverpassElement[] = [
    { type: "way", id: 1, tags: { golf: "hole", ref: "10", par: "4" }, geometry: [pts[0], pts[2]] },
    { type: "way", id: 2, tags: { golf: "hole", ref: "2", par: "3" }, geometry: [pts[0], pts[1]] },
    { type: "way", id: 3, tags: { golf: "green" }, geometry: pts },
    { type: "way", id: 4, tags: { golf: "lateral_water_hazard" }, geometry: pts },
    { type: "way", id: 5, tags: { golf: "cartpath" }, geometry: pts },
    {
      type: "relation",
      id: 6,
      tags: { natural: "water" },
      members: [
        { type: "way", role: "outer", geometry: pts },
        { type: "way", role: "inner", geometry: pts },
      ],
    },
  ]

  it("sorts holes by ref and classifies features", () => {
    const c = parseOverpass(elements, "course-area")
    expect(c.holes.map((h) => h.ref)).toEqual([2, 10])
    expect(c.holes[1].par).toBe(4)
    expect(c.features.map((f) => f.kind).sort()).toEqual(["green", "water", "water"])
  })
})

describe("lie map", () => {
  const green = squareAround(fromLocal(ORIGIN, { x: 0, y: 150 }), 15)
  const bunker = squareAround(fromLocal(ORIGIN, { x: 0, y: 150 }), 5) // inside the green
  const fairway = squareAround(fromLocal(ORIGIN, { x: 0, y: 100 }), 60)
  const water = squareAround(fromLocal(ORIGIN, { x: 60, y: 150 }), 10)
  const lies = buildLieMap(ORIGIN, [
    { kind: "fairway", ring: fairway },
    { kind: "green", ring: green },
    { kind: "bunker", ring: bunker },
    { kind: "water", ring: water },
  ])

  it("returns the worst overlapping lie", () => {
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: 150 }))).toBe("bunker")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 10, y: 150 }))).toBe("green")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: 60 }))).toBe("fairway")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 60, y: 150 }))).toBe("water")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 300, y: 300 }))).toBe("rough")
  })
})

describe("expectedStrokesRemaining", () => {
  it("is worse from worse lies at the same distance", () => {
    const d = 120
    const g = expectedStrokesRemaining("fairway", d)
    expect(expectedStrokesRemaining("rough", d)).toBeGreaterThan(g)
    expect(expectedStrokesRemaining("bunker", d)).toBeGreaterThan(expectedStrokesRemaining("rough", d))
    expect(expectedStrokesRemaining("water", d)).toBeGreaterThan(expectedStrokesRemaining("bunker", d))
  })
  it("rises with distance, and a close green beats a far one", () => {
    expect(expectedStrokesRemaining("fairway", 300)).toBeGreaterThan(expectedStrokesRemaining("fairway", 100))
    expect(expectedStrokesRemaining("green", 3)).toBeLessThan(expectedStrokesRemaining("green", 20))
  })
  it("a 10-foot putt is about 1.6 strokes", () => {
    expect(expectedStrokesRemaining("green", 10 / 3)).toBeCloseTo(1.61, 2)
  })
})

describe("planning", () => {
  // Pin 150 yd north, green 30x30 around it, water on the right, everything else rough.
  const pin = fromLocal(ORIGIN, { x: 0, y: 150 })
  const lies = buildLieMap(ORIGIN, [
    { kind: "green", ring: squareAround(pin, 15) },
    { kind: "water", ring: [
      fromLocal(ORIGIN, { x: 12, y: 100 }),
      fromLocal(ORIGIN, { x: 80, y: 100 }),
      fromLocal(ORIGIN, { x: 80, y: 200 }),
      fromLocal(ORIGIN, { x: 12, y: 200 }),
    ] },
  ])
  const ctx = { from: ORIGIN, aim: pin, pin, lies }
  const mk = (carry: number, offline: number) => Array.from({ length: 200 }, (_, i) => ({
    carryYds: carry + (i % 5) - 2,
    offlineYds: offline + ((i * 7) % 9) - 4,
  }))

  it("prefers the club that reaches the pin over one 40 yd short", () => {
    const ranked = rankClubs([{ club: "9-Iron", shots: mk(110, 0) }, { club: "7-Iron", shots: mk(150, 0) }], ctx)
    expect(ranked[0].club).toBe("7-Iron")
    expect(ranked[0].lieShare.green).toBeGreaterThan(0.9)
  })

  it("aims away from water on the right", () => {
    // Shots centered on the aim line; water starts 12 yd right of the line, green edge is 15.
    const spread = Array.from({ length: 400 }, (_, i) => ({ carryYds: 150, offlineYds: (i % 40) - 20 }))
    const r = bestAim({ club: "7-Iron", shots: spread }, ctx)
    expect(r.offsetYds).toBeLessThan(0)
    expect(r.plan.expectedStrokes).toBeLessThanOrEqual(r.baselineStrokes)
  })
})

import { courseGeometryQuery, courseWayIdsQuery, parseCoast, pickBoundary } from "./overpass"

describe("pickBoundary", () => {
  const box = (name: string, id: number, minlat: number, minlon: number, maxlat: number, maxlon: number) => ({
    type: "relation" as const, id, name, bounds: { minlat, minlon, maxlat, maxlon },
  })
  const pebble = box("Pebble Beach Golf Links", 1, 36.56, -121.96, 36.575, -121.94)
  const spyglass = box("Spyglass Hill Golf Course", 2, 36.575, -121.97, 36.59, -121.95)
  const poppy = box("Poppy Hills Golf Course", 3, 36.5775, -121.9449, 36.592, -121.9351)

  it("prefers the boundary that contains the point", () => {
    expect(pickBoundary([spyglass, pebble, poppy], 36.5685, -121.949)?.id).toBe(1)
  })
  it("uses the course name to choose between overlapping boundaries", () => {
    const big = box("Resort", 4, 36.55, -121.98, 36.6, -121.93)
    expect(pickBoundary([big, pebble], 36.5685, -121.949, "Pebble Beach Golf Links")?.id).toBe(1)
  })
  it("falls back to the nearest when nothing contains the point", () => {
    expect(pickBoundary([spyglass, poppy], 36.5765, -121.955)?.id).toBe(2)
  })
  it("returns null with no candidates and builds area ids by element type", () => {
    expect(pickBoundary([], 0, 0)).toBeNull()
    expect(courseWayIdsQuery({ type: "way", id: 5 })).toContain("area(2400000005)")
    expect(courseWayIdsQuery({ type: "relation", id: 5 })).toContain("area(3600000005)")
    expect(courseGeometryQuery([1, 2])).toContain("way(id:1,2)")
  })
})

describe("coastline as water", () => {
  // West->east line: the sea is on the right, i.e. to the south.
  const coast = [[fromLocal(ORIGIN, { x: -500, y: 0 }), fromLocal(ORIGIN, { x: 500, y: 0 })]]
  const lies = buildLieMap(ORIGIN, [], coast)
  it("puts the sea side in the water and the land side in the rough", () => {
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: -40 }))).toBe("water")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: 40 }))).toBe("rough")
  })
  it("does not guess far from any coast", () => {
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: -5000 }))).toBe("rough")
  })
  it("polygons still take priority over coast", () => {
    const green = squareAround(fromLocal(ORIGIN, { x: 0, y: -40 }), 10)
    const l = buildLieMap(ORIGIN, [{ kind: "green", ring: green }], coast)
    expect(l.lieAt(fromLocal(ORIGIN, { x: 0, y: -40 }))).toBe("green")
  })
})

describe("parseCoast", () => {
  it("splits at vertices clipped outside the box instead of bridging them", () => {
    const p = (lat: number) => ({ lat, lon: -121.9 })
    const lines = parseCoast([
      { type: "way", id: 1, geometry: [p(1), p(2), null as never, p(3), p(4), p(5)] },
      { type: "way", id: 2, geometry: [p(1), null as never] },
    ])
    expect(lines.map((l) => l.length)).toEqual([2, 3])
  })
})
