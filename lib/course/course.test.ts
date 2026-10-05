import { describe, expect, it } from "vitest"
import { bearingDeg, distanceYds, fromLocal, landingPoint, lineLengthYds, pointAlongLine, pointInRing, toLocal } from "./geo"
import { buildLieMap } from "./lies"
import { parseOverpass, type OverpassElement } from "./overpass"
import { expectedFromStart, expectedStrokesRemaining, tourExpected, tourPutting } from "./cost"
import { bestAim, rankClubs } from "./plan"
import { applyCorrections, pickConsensus, validateCorrection, type ConsensusGroup, type CorrectionRow } from "./corrections"
import type { CourseGeometry, CourseHole } from "./overpass"

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
    // Unmapped ground is rough. (Session 9 made this "trees" -- far from any
    // mapped edge -- and Session 11 took that rule out again: it turned
    // untraced fairways into trees.)
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

  // Rollout (lib/course/roll.ts, 2026-09-30) doesn't move any expectation in
  // this file: only Driver and 3-Wood roll, and the one Driver test below
  // lands its shots in rough/trees (~6 yd of roll), so every lie share and
  // ranking comes out the same.
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

import { markPracticeAreas } from "./overpass"

describe("trees, range and out of bounds", () => {
  const pin = fromLocal(ORIGIN, { x: 0, y: 250 })
  const holeLine = [ORIGIN, pin]

  it("maps woods to trees and driving ranges to out of bounds; real surfaces beat woods", () => {
    const woods = squareAround(fromLocal(ORIGIN, { x: 0, y: 100 }), 80)
    const fairway = squareAround(fromLocal(ORIGIN, { x: 0, y: 100 }), 20)
    const range = squareAround(fromLocal(ORIGIN, { x: 200, y: 100 }), 30)
    const lies = buildLieMap(ORIGIN, [
      { kind: "trees", ring: woods },
      { kind: "fairway", ring: fairway },
      { kind: "range", ring: range },
    ])
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: 100 }))).toBe("fairway")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 50, y: 100 }))).toBe("trees")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 200, y: 100 }))).toBe("oob")
  })

  it("reclassifies a fairway no hole line touches as a practice range", () => {
    const real = squareAround(fromLocal(ORIGIN, { x: 0, y: 120 }), 15)
    const practice = squareAround(fromLocal(ORIGIN, { x: 300, y: 120 }), 40)
    const features = [
      { kind: "fairway" as const, ring: real },
      { kind: "fairway" as const, ring: practice },
    ]
    markPracticeAreas([{ id: "h1", ref: 1, par: 4, line: holeLine }], features)
    expect(features.map((f) => f.kind)).toEqual(["fairway", "range"])
    // no hole lines mapped -> nothing to compare against, leave as is
    const f2 = [{ kind: "fairway" as const, ring: practice }]
    markPracticeAreas([], f2)
    expect(f2[0].kind).toBe("fairway")
  })

  it("uses Broadie's published recovery column for trees, and out of bounds costs a replay from where you hit", () => {
    // Table 9 at 100 yd: fairway 2.80, rough 3.02, sand 3.23, recovery 3.80
    expect(expectedStrokesRemaining("trees", 100)).toBeCloseTo(3.8, 5)
    expect(expectedStrokesRemaining("trees", 100)).toBeGreaterThan(expectedStrokesRemaining("bunker", 100))
    // OB from a 250 yd tee shot: 1 penalty + replaying from the tee at 250 yd, whatever the landing spot
    expect(expectedStrokesRemaining("oob", 30, { distYds: 250, lie: "tee" })).toBeCloseTo(1 + tourExpected("tee", 250), 5)
    // default origin is the fairway at the landing distance
    expect(expectedStrokesRemaining("oob", 250)).toBeCloseTo(1 + tourExpected("fairway", 250), 5)
  })

  it("a tight club beats a long, wide one when hand-marked trees line one side only", () => {
    const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const r = rng(7)
    // The driver's natural miss leans right (a common real tendency), which is exactly
    // the side the golfer has hand-marked as trees -- a symmetric assumption would miss this.
    const wide = Array.from({ length: 600 }, () => ({ carryYds: 265 + (r() - 0.5) * 20, offlineYds: (r() - 0.5) * 100 + 15 }))
    const tight = Array.from({ length: 600 }, () => ({ carryYds: 215 + (r() - 0.5) * 12, offlineYds: (r() - 0.5) * 24 }))
    const far = fromLocal(ORIGIN, { x: 0, y: 420 })
    // Trees on the right of the hole only (15-200 yd off the line); nothing marked on the left.
    const treesRight = [
      fromLocal(ORIGIN, { x: 15, y: 0 }),
      fromLocal(ORIGIN, { x: 200, y: 0 }),
      fromLocal(ORIGIN, { x: 200, y: 420 }),
      fromLocal(ORIGIN, { x: 15, y: 420 }),
    ]
    const lies = buildLieMap(ORIGIN, [], [], [{ id: "z1", lie: "trees", ring: treesRight }])
    const [best] = rankClubs(
      [{ club: "Driver", shots: wide }, { club: "7-Wood", shots: tight }],
      { from: ORIGIN, aim: fromLocal(ORIGIN, { x: 0, y: 265 }), pin: far, lies }
    )
    expect(best.club).toBe("7-Wood")
    // A wide-left miss stays in the (unmarked) rough, not trees, confirming the marking is one-sided.
    expect(lies.lieAt(fromLocal(ORIGIN, { x: -100, y: 200 }))).toBe("rough")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 100, y: 200 }))).toBe("trees")
  })
})

describe("user-drawn zones", () => {
  it("override the mapped lie entirely, including inside a fairway", () => {
    const fairway = squareAround(fromLocal(ORIGIN, { x: 0, y: 150 }), 60)
    const water = [{ id: "z1", lie: "water" as const, ring: squareAround(fromLocal(ORIGIN, { x: 20, y: 150 }), 10) }]
    const lies = buildLieMap(ORIGIN, [{ kind: "fairway", ring: fairway }], [], water)
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 20, y: 150 }))).toBe("water")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: -20, y: 150 }))).toBe("fairway")
  })

  it("can mark a safe area inside something the map got wrong (e.g. a bogus out-of-bounds zone)", () => {
    const range = squareAround(fromLocal(ORIGIN, { x: 0, y: 150 }), 60)
    const safe = [{ id: "z1", lie: "fairway" as const, ring: squareAround(fromLocal(ORIGIN, { x: 0, y: 150 }), 20) }]
    const lies = buildLieMap(ORIGIN, [{ kind: "range", ring: range }], [], safe)
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: 150 }))).toBe("fairway")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 55, y: 150 }))).toBe("oob")
  })

  it("the most recently drawn zone wins where two user zones overlap", () => {
    const zones = [
      { id: "older", lie: "trees" as const, ring: squareAround(ORIGIN, 20) },
      { id: "newer", lie: "water" as const, ring: squareAround(ORIGIN, 10) },
    ]
    const lies = buildLieMap(ORIGIN, [], [], zones)
    expect(lies.lieAt(ORIGIN)).toBe("water")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 15, y: 0 }))).toBe("trees")
  })
})

import { defaultTeeAim, fairwayExtent, projectOnLine } from "./aim"

describe("default tee aim", () => {
  const rect = (x0: number, y0: number, x1: number, y1: number) => [
    fromLocal(ORIGIN, { x: x0, y: y0 }), fromLocal(ORIGIN, { x: x1, y: y0 }),
    fromLocal(ORIGIN, { x: x1, y: y1 }), fromLocal(ORIGIN, { x: x0, y: y1 }),
  ]
  const pin = fromLocal(ORIGIN, { x: 0, y: 400 })
  const line = [ORIGIN, pin]

  it("projects a point onto the line", () => {
    const q = projectOnLine(line, fromLocal(ORIGIN, { x: 12, y: 150 }))
    expect(q.along).toBeCloseTo(150, 1)
    expect(q.off).toBeCloseTo(12, 1)
  })

  it("finds the fairway extent along the hole, ignoring fairways on other holes", () => {
    const features = [
      { kind: "fairway" as const, ring: rect(-15, 150, 15, 330) },
      { kind: "fairway" as const, ring: rect(300, 100, 330, 300) }, // some other hole
    ]
    const ext = fairwayExtent(line, features)
    expect(ext?.start).toBeCloseTo(150, 0)
    expect(ext?.end).toBeCloseTo(330, 0)
  })

  it("aims for the middle of the fairway on a par 4", () => {
    const features = [{ kind: "fairway" as const, ring: rect(-15, 150, 15, 330) }]
    const aim = toLocal(ORIGIN, defaultTeeAim(line, pin, features, 264))
    expect(aim.y).toBeCloseTo(240, 0)
    expect(Math.abs(aim.x)).toBeLessThan(0.5)
  })

  it("never aims past the longest carry, and aims at the pin when there is no fairway to use", () => {
    const far = [{ kind: "fairway" as const, ring: rect(-15, 250, 15, 390) }] // middle 320 > 264 carry
    expect(toLocal(ORIGIN, defaultTeeAim(line, pin, far, 264)).y).toBeCloseTo(264, 0)
    const par3pin = fromLocal(ORIGIN, { x: 0, y: 150 })
    const p3 = toLocal(ORIGIN, defaultTeeAim([ORIGIN, par3pin], par3pin, [], 264))
    expect(p3.y).toBeCloseTo(150, 0)
  })
})

describe("Broadie baseline (published PGA TOUR tables)", () => {
  it("reproduces the tabulated Table 9 values exactly at table distances", () => {
    expect(tourExpected("fairway", 100)).toBeCloseTo(2.8, 5)
    expect(tourExpected("rough", 100)).toBeCloseTo(3.02, 5)
    expect(tourExpected("sand", 100)).toBeCloseTo(3.23, 5)
    expect(tourExpected("recovery", 100)).toBeCloseTo(3.8, 5)
    expect(tourExpected("tee", 300)).toBeCloseTo(3.71, 5)
    expect(tourExpected("fairway", 600)).toBeCloseTo(4.89, 5)
    expect(tourExpected("fairway", 10)).toBeCloseTo(2.18, 5)
  })
  it("interpolates between table rows", () => {
    expect(tourExpected("fairway", 110)).toBeCloseTo((2.8 + 2.85) / 2, 5)
    expect(tourExpected("rough", 15)).toBeCloseTo((2.34 + 2.59) / 2, 5)
  })
  it("the tee column starts at 100 yd; shorter tee shots use the fairway column", () => {
    expect(tourExpected("tee", 80)).toBeCloseTo(2.75, 5)
    expect(tourExpected("tee", 100)).toBeCloseTo(2.92, 5)
  })
  it("putting matches Broadie's Putts Gained figure", () => {
    expect(tourPutting(10)).toBeCloseTo(1.61, 5)
    expect(tourPutting(20)).toBeCloseTo(1.87, 5)
    expect(tourPutting(90)).toBeCloseTo(2.36, 5)
    expect(tourPutting(0)).toBeCloseTo(1, 5)
    expect(tourPutting(150)).toBeGreaterThan(tourPutting(90))
  })
  it("a green landing is putting distance in feet, and water costs a stroke plus a drop", () => {
    expect(expectedStrokesRemaining("green", 10 / 3)).toBeCloseTo(1.61, 2)
    expect(expectedStrokesRemaining("water", 120)).toBeCloseTo(1 + 2.85, 5)
  })
  it("strokes gained = expected before - expected after - 1 (sanity)", () => {
    // Holing a 100 yd shot from the fairway would be gaining 2.80 - 0 - 1 = 1.80.
    const before = expectedFromStart("fairway", 100)
    expect(before - 0 - 1).toBeCloseTo(1.8, 5)
  })
})

import { buildValueGrid, deltaColor, dispersionRing } from "./heatmap"

describe("trouble map and dispersion rings", () => {
  const pin = fromLocal(ORIGIN, { x: 0, y: 150 })
  const lies = buildLieMap(ORIGIN, [
    { kind: "green", ring: squareAround(pin, 12) },
    { kind: "water", ring: squareAround(fromLocal(ORIGIN, { x: 60, y: 100 }), 15) },
  ])

  it("scores water and greens relative to the fairway at the same distance", () => {
    const cells = buildValueGrid([ORIGIN, pin], pin, ORIGIN, "fairway", lies)
    expect(cells.length).toBeGreaterThan(100)
    expect(cells.length).toBeLessThanOrEqual(1700)
    const at = (x: number, y: number) => {
      const c = cells.find((cell) => {
        const a = toLocal(ORIGIN, cell.sw)
        const b = toLocal(ORIGIN, cell.ne)
        return x >= a.x && x < b.x && y >= a.y && y < b.y
      })!
      return c.delta
    }
    expect(at(0, 150)).toBeLessThan(-0.3) // on the green: far better than fairway
    expect(at(55, 100)).toBeGreaterThan(0.9) // in the water: about a stroke worse
    expect(at(0, 80)).toBeGreaterThan(0.1) // plain rough is a little worse
  })

  it("colours better-than-fairway green, neutral clear, trouble amber to red", () => {
    expect(deltaColor(-0.6).color).toBe("map-better")
    expect(deltaColor(0).opacity).toBe(0)
    expect(deltaColor(0.4).color).toBe("map-caution")
    expect(deltaColor(1.1).color).toBe("map-worse")
  })

  it("50% ring is inside the 90% ring and both are centred on the shots", () => {
    const pts = Array.from({ length: 400 }, (_, i) => fromLocal(ORIGIN, { x: ((i * 37) % 41) - 20, y: 150 + (((i * 53) % 23) - 11) }))
    const r50 = dispersionRing(pts, 1.177)
    const r90 = dispersionRing(pts, 2.146)
    expect(r50.length).toBe(49)
    const span = (r: typeof r50) => Math.max(...r.map((p) => toLocal(ORIGIN, p).x)) - Math.min(...r.map((p) => toLocal(ORIGIN, p).x))
    expect(span(r90)).toBeGreaterThan(span(r50))
    expect(dispersionRing(pts.slice(0, 3), 1)).toEqual([])
  })
})

import { applyConfirmedAbsent, assessHoleDataQuality, estimatedFairwayCorridor } from "./dataQuality"

describe("hole data-quality badge", () => {
  const pin = fromLocal(ORIGIN, { x: 0, y: 150 })
  const hole = { id: "h1", ref: 1, par: 4, line: [ORIGIN, pin] }

  it("is mapped when OSM has fairway, greens, bunkers and water near the hole", () => {
    const features = [
      { kind: "fairway" as const, ring: squareAround(fromLocal(ORIGIN, { x: 0, y: 75 }), 20) },
      { kind: "green" as const, ring: squareAround(pin, 15) },
      { kind: "bunker" as const, ring: squareAround(fromLocal(ORIGIN, { x: 20, y: 130 }), 8) },
      { kind: "water" as const, ring: squareAround(fromLocal(ORIGIN, { x: -25, y: 100 }), 10) },
    ]
    const q = assessHoleDataQuality(hole, features, [])
    expect(q).toEqual({ fairway: "mapped", greens: "mapped", bunkers: "mapped", water: "mapped" })
  })

  it("falls back to estimated fairway and missing bunkers/water/greens when nothing is mapped or drawn", () => {
    const q = assessHoleDataQuality(hole, [], [])
    expect(q).toEqual({ fairway: "estimated", greens: "missing", bunkers: "missing", water: "missing" })
  })

  it("recognizes a hand-drawn zone as hand-drawn, not mapped or missing", () => {
    const zones = [{ id: "z1", lie: "bunker" as const, ring: squareAround(fromLocal(ORIGIN, { x: 10, y: 100 }), 8) }]
    const q = assessHoleDataQuality(hole, [], zones)
    expect(q.bunkers).toBe("hand-drawn")
    expect(q.fairway).toBe("estimated") // hand-drawing a bunker doesn't invent a fairway
  })

  it("a feature far from this hole's line doesn't count as mapped for it", () => {
    const farAway = [{ kind: "fairway" as const, ring: squareAround(fromLocal(ORIGIN, { x: 500, y: 500 }), 20) }]
    expect(assessHoleDataQuality(hole, farAway, []).fairway).toBe("estimated")
  })

  it("the estimated fairway corridor runs from tee to pin and is used by buildLieMap as fairway", () => {
    const corridor = estimatedFairwayCorridor(hole, pin, 30)
    expect(corridor.kind).toBe("fairway")
    const lies = buildLieMap(ORIGIN, [corridor])
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: 75 }))).toBe("fairway") // middle of the corridor
    // Outside its width, near or far, is plain (unmapped) rough. Session 9 made the
    // far case "trees"; Session 11 removed that rule.
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 100, y: 75 }))).toBe("rough")
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 25, y: 75 }))).toBe("rough") // 10 yd off its edge
  })

  it("a real hazard still beats the estimated fairway corridor (priority 1: mapped/drawn > 2: fallback)", () => {
    const corridor = estimatedFairwayCorridor(hole, pin, 30)
    const water = squareAround(fromLocal(ORIGIN, { x: 0, y: 75 }), 8)
    const lies = buildLieMap(ORIGIN, [corridor, { kind: "water", ring: water }])
    expect(lies.lieAt(fromLocal(ORIGIN, { x: 0, y: 75 }))).toBe("water")
  })

  it("confirming a missing hazard as absent downgrades it, but leaves other surfaces and a real mapped hazard alone", () => {
    const q = assessHoleDataQuality(hole, [], [])
    expect(q.bunkers).toBe("missing")
    expect(q.water).toBe("missing")
    const confirmed = applyConfirmedAbsent(q, { water: true })
    expect(confirmed.water).toBe("confirmed-absent")
    expect(confirmed.bunkers).toBe("missing") // not confirmed, unaffected
    expect(confirmed.fairway).toBe("estimated") // untouched surface unaffected

    const mappedFeatures = [{ kind: "bunker" as const, ring: squareAround(fromLocal(ORIGIN, { x: 10, y: 100 }), 8) }]
    const q2 = assessHoleDataQuality(hole, mappedFeatures, [])
    // confirming "absent" on a hazard that's actually mapped is a no-op, not a downgrade
    expect(applyConfirmedAbsent(q2, { bunkers: true }).bunkers).toBe("mapped")
  })
})

describe("bestAim re-scores its winner on held-out shots", () => {
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

  it("still finds the same real signal (aim away from water) split across two disjoint halves", () => {
    const spread = Array.from({ length: 400 }, (_, i) => ({ carryYds: 150, offlineYds: (i % 40) - 20 }))
    const r = bestAim({ club: "7-Iron", shots: spread }, ctx)
    expect(r.offsetYds).toBeLessThan(0)
    expect(r.plan.n).toBe(200) // scored on the held-out half only, not all 400
    expect(r.plan.expectedStrokes).toBeLessThanOrEqual(r.baselineStrokes)
  })

  it("searches a lateral range tied to where the club's shots actually land, not wherever the aim marker sits", () => {
    // Aim marker sits at the pin, 400 yd away (as if planning a much longer
    // club) -- but THIS club only carries ~150 yd, and a hazard sits directly
    // on the aim line at that landing distance, wide enough that essentially
    // every shot is in it at zero offset; fully escaping it needs about a
    // 20 yd shift. Sizing the search's yard-to-angle conversion off the aim
    // marker's (unrelated) 400 yd distance caps the real lateral reach at
    // 150 * (60/400) = 22.5 yd -- borderline/insufficient. Sizing it off the
    // club's own ~150 yd mean carry allows the full +-60 yd requested, easily
    // enough.
    const farAim = fromLocal(ORIGIN, { x: 0, y: 400 })
    const onLineWater = squareAround(fromLocal(ORIGIN, { x: 0, y: 150 }), 10)
    const farLies = buildLieMap(ORIGIN, [{ kind: "water", ring: onLineWater }])
    const farCtx = { from: ORIGIN, aim: farAim, pin: farAim, lies: farLies }
    const shots = Array.from({ length: 400 }, (_, i) => ({ carryYds: 150, offlineYds: (i % 21) - 10 }))
    const r = bestAim({ club: "7-Iron", shots }, farCtx)
    expect(r.plan.lieShare.water).toBeLessThan(0.05) // fully escapes, not just partially
  })

  it("converges on an interior optimum, not the search's outer edge, once a single hazard is cleared", () => {
    // Distance-to-pin keeps rising with lateral offset in open rough, so once
    // a shift clears the one bunker in the way, going further only gets
    // worse -- the search should settle near that clearing point, not at
    // its own +-60 yd boundary.
    const shots = Array.from({ length: 400 }, (_, i) => ({ carryYds: 150, offlineYds: (i % 21) - 10 }))
    const bunker = squareAround(fromLocal(ORIGIN, { x: 0, y: 150 }), 8) // dead center, needs ~16 yd to clear
    const openLies = buildLieMap(ORIGIN, [{ kind: "bunker", ring: bunker }]) // nothing else mapped anywhere
    const r = bestAim({ club: "7-Iron", shots }, { from: ORIGIN, aim: pin, pin, lies: openLies })
    expect(Math.abs(r.offsetYds)).toBeLessThan(30) // well short of the +-60 search boundary
  })
})

describe("course corrections", () => {
  function hole(overrides: Partial<CourseHole> = {}): CourseHole {
    return { id: "way/1", ref: 12, par: 3, line: [ORIGIN, fromLocal(ORIGIN, { x: 0, y: 400 })], ...overrides }
  }
  function geometry(holes: CourseHole[]): CourseGeometry {
    return { holes, features: [], coast: [], scope: "course-area", version: 3 }
  }
  function row(field: CorrectionRow["field_name"], value: string, holeId = "way/1"): CorrectionRow {
    return { hole_id: holeId, field_name: field, corrected_value: value }
  }

  it("leaves a hole with no matching correction untouched, same object reference", () => {
    const h = hole()
    const g = geometry([h])
    const out = applyCorrections(g, [row("par", "4", "way/999")])
    expect(out.holes[0]).toBe(h) // reference equality: nothing should re-render off this
  })

  it("overrides par (the Colts Neck hole 12 case)", () => {
    const g = geometry([hole({ par: 3 })])
    const out = applyCorrections(g, [row("par", "4")])
    expect(out.holes[0].par).toBe(4)
    expect(out.holes[0].correctedFields).toEqual(["par"])
  })

  it("ignores an out-of-range corrected par instead of applying garbage", () => {
    const g = geometry([hole({ par: 3 })])
    const out = applyCorrections(g, [row("par", "7")])
    expect(out.holes[0].par).toBe(3)
  })

  it("moves only the tee point, and only the coordinate that was actually corrected", () => {
    const original = hole()
    const g = geometry([original])
    const out = applyCorrections(g, [row("tee_lat", String(ORIGIN.lat + 0.001))])
    expect(out.holes[0].line[0].lat).toBeCloseTo(ORIGIN.lat + 0.001, 6)
    expect(out.holes[0].line[0].lng).toBe(original.line[0].lng) // untouched
    expect(out.holes[0].line[1]).toEqual(original.line[1]) // green end untouched
  })

  it("sets yardage and stroke index, fields OSM never provides", () => {
    const g = geometry([hole()])
    const out = applyCorrections(g, [row("yardage", "410"), row("handicap", "7")])
    expect(out.holes[0].yardageYds).toBe(410)
    expect(out.holes[0].strokeIndex).toBe(7)
    expect(out.holes[0].correctedFields).toEqual(expect.arrayContaining(["yardage", "handicap"]))
  })

  it("passes good values", () => {
    const nearby = fromLocal(ORIGIN, { x: 60, y: 60 }) // ~85 yd away
    const errors = validateCorrection(
      { par: 4, teeLat: nearby.lat, teeLng: nearby.lng, yardageYds: 410, strokeIndex: 7, reason: "Par 4, not Par 3" },
      ORIGIN
    )
    expect(errors).toEqual({})
    expect(validateCorrection({}, ORIGIN)).toEqual({})
  })

  it("rejects par outside 3-6 or not a whole number", () => {
    expect(validateCorrection({ par: 9 }, ORIGIN).par).toBeTruthy()
    expect(validateCorrection({ par: 2 }, ORIGIN).par).toBeTruthy()
    expect(validateCorrection({ par: 4.5 }, ORIGIN).par).toBeTruthy()
    expect(validateCorrection({ par: NaN }, ORIGIN).par).toBeTruthy()
    for (const par of [3, 4, 5, 6]) expect(validateCorrection({ par }, ORIGIN).par).toBeUndefined()
  })

  it("rejects stroke index outside 1-18 or not a whole number", () => {
    expect(validateCorrection({ strokeIndex: 0 }, ORIGIN).strokeIndex).toBeTruthy()
    expect(validateCorrection({ strokeIndex: 19 }, ORIGIN).strokeIndex).toBeTruthy()
    expect(validateCorrection({ strokeIndex: 2.5 }, ORIGIN).strokeIndex).toBeTruthy()
    expect(validateCorrection({ strokeIndex: 1 }, ORIGIN).strokeIndex).toBeUndefined()
    expect(validateCorrection({ strokeIndex: 18 }, ORIGIN).strokeIndex).toBeUndefined()
  })

  it("rejects yardage outside 50-700", () => {
    expect(validateCorrection({ yardageYds: 49 }, ORIGIN).yardageYds).toBeTruthy()
    expect(validateCorrection({ yardageYds: 701 }, ORIGIN).yardageYds).toBeTruthy()
    expect(validateCorrection({ yardageYds: 50 }, ORIGIN).yardageYds).toBeUndefined()
    expect(validateCorrection({ yardageYds: 700 }, ORIGIN).yardageYds).toBeUndefined()
  })

  it("rejects a tee 2 miles from the current tee, accepts one within 150 yards", () => {
    const twoMiles = fromLocal(ORIGIN, { x: 0, y: 2 * 1760 })
    const far = validateCorrection({ teeLat: twoMiles.lat, teeLng: twoMiles.lng }, ORIGIN)
    expect(far.teeLat).toBeTruthy()
    expect(far.teeLng).toBeTruthy()
    const near = fromLocal(ORIGIN, { x: 0, y: 140 })
    expect(validateCorrection({ teeLat: near.lat, teeLng: near.lng }, ORIGIN)).toEqual({})
    const justOver = fromLocal(ORIGIN, { x: 0, y: 160 })
    expect(validateCorrection({ teeLat: justOver.lat, teeLng: justOver.lng }, ORIGIN).teeLat).toBeTruthy()
  })

  it("checks a lone tee coordinate against the current tee's other coordinate", () => {
    const far = fromLocal(ORIGIN, { x: 0, y: 5000 })
    expect(validateCorrection({ teeLat: far.lat }, ORIGIN).teeLat).toBeTruthy()
  })

  it("rejects out-of-range coordinates and a reason over 200 characters", () => {
    expect(validateCorrection({ teeLat: 200 }, ORIGIN).teeLat).toBeTruthy()
    expect(validateCorrection({ teeLng: -181 }, ORIGIN).teeLng).toBeTruthy()
    expect(validateCorrection({ reason: "x".repeat(200) }, ORIGIN).reason).toBeUndefined()
    expect(validateCorrection({ reason: "x".repeat(201) }, ORIGIN).reason).toBeTruthy()
  })
})

describe("pickConsensus", () => {
  const group = (over: Partial<ConsensusGroup> = {}): ConsensusGroup => ({
    hole_id: "way/1",
    field_name: "par",
    corrected_value: "4",
    voters: 2,
    last_at: "2026-10-01T00:00:00Z",
    ...over,
  })

  it("applies a value only when 2+ distinct golfers agree", () => {
    expect(pickConsensus([group({ voters: 1 })])).toEqual([])
    expect(pickConsensus([group({ voters: 2 })])).toEqual([{ hole_id: "way/1", field_name: "par", corrected_value: "4" }])
  })

  it("cannot be lowered below 2 by the caller", () => {
    expect(pickConsensus([group({ voters: 1 })], 1)).toEqual([])
  })

  it("keeps fields and holes separate", () => {
    const out = pickConsensus([
      group(),
      group({ field_name: "yardage", corrected_value: "410" }),
      group({ hole_id: "way/2", corrected_value: "5", voters: 3 }),
    ])
    expect(out).toHaveLength(3)
  })

  it("when two values both qualify, the most-agreed one wins, then the latest", () => {
    const most = pickConsensus([group({ corrected_value: "4", voters: 2 }), group({ corrected_value: "5", voters: 3 })])
    expect(most).toEqual([{ hole_id: "way/1", field_name: "par", corrected_value: "5" }])
    const latest = pickConsensus([
      group({ corrected_value: "4", last_at: "2026-10-01T00:00:00Z" }),
      group({ corrected_value: "5", last_at: "2026-10-03T00:00:00Z" }),
    ])
    expect(latest[0].corrected_value).toBe("5")
  })

  it("ignores a value that only one golfer submitted even if a different one is confirmed", () => {
    const out = pickConsensus([group({ corrected_value: "4", voters: 2 }), group({ corrected_value: "6", voters: 1 })])
    expect(out).toEqual([{ hole_id: "way/1", field_name: "par", corrected_value: "4" }])
  })
})
