import { describe, expect, it } from "vitest"
import { fromLocal, toLocal, type LatLng } from "./geo"
import { buildLieMap } from "./lies"
import { tourExpected } from "./cost"
import { evaluateClub, flagsUnmapped, simulateLandings, waterEntryPoint } from "./plan"
import { isRoad, joinRings, parseBoundaryShape, parseOverpass, type CourseBoundaryShape, type CourseFeature } from "./overpass"
import { seededRng } from "@/lib/dispersion/stats"
import { boundaryStatus } from "./dataQuality"

const ORIGIN = { lat: 36.5685, lng: -121.949 }
const at = (x: number, y: number) => fromLocal(ORIGIN, { x, y })
const rect = (x0: number, y0: number, x1: number, y1: number): LatLng[] => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)]

// A fairway 40 yd wide (x -20..20) from 100 to 300 yd, inside a 400 x 500 yd course boundary.
const fairway = { kind: "fairway" as const, ring: rect(-20, 100, 20, 300) }
const boundary: CourseBoundaryShape = { outer: [rect(-200, -50, 200, 450)], inner: [] }

describe("course boundary", () => {
  const lies = buildLieMap(ORIGIN, [fairway], [], [], { boundary })

  it("is out of bounds outside the boundary, and the rule is skipped when none is mapped", () => {
    expect(lies.lieAt(at(250, 200))).toBe("oob")
    expect(lies.classify(at(250, 200)).source).toBe("mapped")
    expect(buildLieMap(ORIGIN, [fairway]).lieAt(at(250, 200))).not.toBe("oob")
  })

  it("counts a hole cut out of the boundary (private homes) as out of bounds", () => {
    const withHole = buildLieMap(ORIGIN, [fairway], [], [], { boundary: { ...boundary, inner: [rect(60, 150, 120, 250)] } })
    expect(withHole.lieAt(at(90, 200))).toBe("oob")
    expect(withHole.lieAt(at(40, 200))).toBe("rough")
  })

  it("lets a mapped green just outside a sloppy boundary stay a green, and the sea stay water", () => {
    const green = { kind: "green" as const, ring: rect(190, 300, 230, 340) }
    const coast = [[at(-500, -60), at(500, -60)]] // sea to the south, below the boundary
    const l = buildLieMap(ORIGIN, [fairway, green], coast, [], { boundary })
    expect(l.lieAt(at(220, 320))).toBe("green")
    expect(l.lieAt(at(0, -80))).toBe("water")
  })

  it("boundaryStatus reports whether one is mapped", () => {
    expect(boundaryStatus({ boundary })).toBe("mapped")
    expect(boundaryStatus({ boundary: null })).toBe("missing")
    expect(boundaryStatus({})).toBe("missing")
    expect(boundaryStatus(null)).toBe("missing")
  })
})

describe("buildings, roads and cover", () => {
  const building = { kind: "building" as const, ring: rect(60, 200, 80, 220) }
  const scrub = { kind: "scrub" as const, ring: rect(-100, 150, -60, 200) }
  const residential = { kind: "residential" as const, ring: rect(100, 50, 180, 350) }
  const road = { kind: "road" as const, line: [at(-150, 400), at(150, 400)] }
  const treeRow = { kind: "treeRow" as const, line: [at(-50, 0), at(-50, 90)] }
  const features = [fairway, building, scrub, residential]
  const lies = buildLieMap(ORIGIN, features, [], [], { boundary, lines: [road, treeRow] })

  it("puts a ball in a building out of bounds", () => {
    expect(lies.lieAt(at(70, 210))).toBe("oob")
  })

  it("puts a ball within 4 yd of a road out of bounds, but not 8 yd away", () => {
    expect(lies.lieAt(at(0, 403))).toBe("oob")
    expect(lies.lieAt(at(0, 408))).not.toBe("oob")
  })

  it("plays scrub, tree rows and gardens inside the boundary as trees", () => {
    expect(lies.lieAt(at(-80, 170))).toBe("trees")
    expect(lies.lieAt(at(-45, 40))).toBe("trees")
    expect(lies.classify(at(-45, 40)).source).toBe("mapped")
    expect(lies.lieAt(at(140, 100))).toBe("trees")
  })

  it("ignores residential land when there's no boundary to say it's the course's own", () => {
    const noBoundary = buildLieMap(ORIGIN, features)
    // 30 yd from the fairway edge would be inferred trees anyway, so test inside the band instead
    const res2 = { kind: "residential" as const, ring: rect(22, 150, 40, 200) }
    expect(buildLieMap(ORIGIN, [fairway, res2]).lieAt(at(30, 170))).toBe("rough")
    expect(buildLieMap(ORIGIN, [fairway, res2], [], [], { boundary }).lieAt(at(30, 170))).toBe("trees")
    expect(noBoundary.classify(at(140, 100)).source).toBe("inferred")
  })

  it("real playing surfaces still win where they overlap", () => {
    const fairwayOverRoad = buildLieMap(ORIGIN, [fairway], [], [], { lines: [{ kind: "road", line: [at(-50, 200), at(50, 200)] }] })
    expect(fairwayOverRoad.lieAt(at(0, 200))).toBe("fairway")
    expect(fairwayOverRoad.lieAt(at(30, 200))).toBe("oob")
  })
})

describe("unmapped ground", () => {
  const lies = buildLieMap(ORIGIN, [fairway], [], [], { boundary })

  it("is rough however far it is from a mapped fairway, flagged as inferred (never trees: Session 11)", () => {
    expect(lies.classify(at(30, 200))).toEqual({ lie: "rough", source: "inferred" }) // 10 yd off
    expect(lies.classify(at(80, 200))).toEqual({ lie: "rough", source: "inferred" }) // 60 yd off
    expect(lies.classify(at(180, 400))).toEqual({ lie: "rough", source: "inferred" }) // 160 yd off
    expect(lies.classify(at(0, 200))).toEqual({ lie: "fairway", source: "mapped" })
  })

  it("is rough when nothing at all is mapped", () => {
    expect(buildLieMap(ORIGIN, []).classify(at(500, 500))).toEqual({ lie: "rough", source: "inferred" })
  })

  it("user zones still override everything", () => {
    const zones = [
      { id: "a", lie: "fairway" as const, ring: rect(240, 190, 260, 210) }, // outside the boundary
      { id: "b", lie: "green" as const, ring: rect(65, 205, 75, 215) }, // inside a building
      { id: "c", lie: "bunker" as const, ring: rect(-5, 195, 5, 205) }, // inside the fairway
      { id: "d", lie: "oob" as const, ring: rect(75, 180, 85, 190) }, // inferred ground
    ]
    const building = { kind: "building" as const, ring: rect(60, 200, 80, 220) }
    const l = buildLieMap(ORIGIN, [fairway, building], [], zones, { boundary })
    expect(l.lieAt(at(250, 200))).toBe("fairway")
    expect(l.lieAt(at(70, 210))).toBe("green")
    expect(l.lieAt(at(0, 200))).toBe("bunker")
    expect(l.classify(at(80, 185))).toEqual({ lie: "oob", source: "mapped" })
  })

  it("reports the share of a club's shots that stop on guessed ground", () => {
    const pin = at(0, 400)
    const onFairway = Array.from({ length: 50 }, (_, i) => ({ carryYds: 180 + (i % 10), offlineYds: (i % 7) - 3 }))
    const wide = onFairway.map((s) => ({ ...s, offlineYds: s.offlineYds + 60 }))
    const a = evaluateClub({ club: "7-Iron", shots: onFairway }, { from: ORIGIN, aim: pin, pin, lies })
    const b = evaluateClub({ club: "7-Iron", shots: wide }, { from: ORIGIN, aim: pin, pin, lies })
    expect(a.unmappedShare).toBe(0)
    expect(flagsUnmapped(a)).toBe(false)
    expect(b.unmappedShare).toBe(1)
    expect(flagsUnmapped(b)).toBe(true)
    expect(flagsUnmapped({ unmappedShare: 0.2 })).toBe(false)
    expect(flagsUnmapped({ unmappedShare: 0.21 })).toBe(true)
  })
})

describe("water drop at the entry point", () => {
  // A lake across the hole from 140 to 200 yd, green around the pin at 250.
  const pin = at(0, 250)
  const lake = { kind: "water" as const, ring: rect(-100, 140, 100, 200) }
  const green = { kind: "green" as const, ring: rect(-15, 235, 15, 265) }
  const lies = buildLieMap(ORIGIN, [lake, green])
  const shots = Array.from({ length: 20 }, () => ({ carryYds: 170, offlineYds: 0 }))

  it("finds where the shot last crossed into the water", () => {
    const [l] = simulateLandings("7-Iron", shots.slice(0, 1), ORIGIN, 0, lies)
    expect(l.lie).toBe("water")
    expect(l.dropPoint).not.toBeNull()
    const drop = toLocal(ORIGIN, l.dropPoint as LatLng)
    expect(drop.y).toBeGreaterThan(139)
    expect(drop.y).toBeLessThanOrEqual(140)
    expect(Math.abs(drop.x)).toBeLessThan(0.01)
  })

  it("plays from the entry distance, still one penalty stroke", () => {
    const plan = evaluateClub({ club: "7-Iron", shots }, { from: ORIGIN, aim: pin, pin, lies })
    // this shot + penalty + fairway from ~110 yd (entry at 140, pin at 250), not from 80 yd (where it landed)
    expect(plan.expectedStrokes).toBeCloseTo(1 + 1 + tourExpected("fairway", 110), 1)
    expect(plan.expectedStrokes).toBeGreaterThan(1 + 1 + tourExpected("fairway", 85))
  })

  it("falls back to the landing distance when there's no dry ground behind the shot", () => {
    const allWater = buildLieMap(ORIGIN, [{ kind: "water", ring: rect(-100, -50, 100, 300) }])
    expect(waterEntryPoint(ORIGIN, at(0, 170), at(0, 170), allWater)).toBeNull()
    const plan = evaluateClub({ club: "7-Iron", shots }, { from: ORIGIN, aim: pin, pin, lies: allWater })
    expect(plan.expectedStrokes).toBeCloseTo(1 + 1 + tourExpected("fairway", 80), 5)
  })
})

describe("OpenStreetMap parsing for Session 9 features", () => {
  it("counts roads but not cart paths, walking paths or tunnels", () => {
    expect(isRoad({ highway: "residential" })).toBe(true)
    expect(isRoad({ highway: "service" })).toBe(true)
    expect(isRoad({ highway: "service", golf: "cartpath" })).toBe(false)
    expect(isRoad({ highway: "path", golf: "cartpath" })).toBe(false)
    expect(isRoad({ highway: "footway" })).toBe(false)
    expect(isRoad({ highway: "primary", tunnel: "yes" })).toBe(false)
    expect(isRoad({ building: "yes" })).toBe(false)
  })

  it("parses buildings, scrub and residential as areas, roads and tree rows as lines", () => {
    const g = (pts: [number, number][]) => pts.map(([lat, lon]) => ({ lat, lon }))
    const sq = g([[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0], [0, 0]])
    const geo = parseOverpass(
      [
        { type: "way", id: 1, tags: { building: "house" }, geometry: sq },
        { type: "way", id: 2, tags: { natural: "scrub" }, geometry: sq },
        { type: "way", id: 3, tags: { landuse: "residential" }, geometry: sq },
        { type: "way", id: 4, tags: { highway: "tertiary" }, geometry: g([[0, 0], [0, 0.002]]) },
        { type: "way", id: 5, tags: { highway: "service", golf: "cartpath" }, geometry: g([[0, 0], [0, 0.002]]) },
        { type: "way", id: 6, tags: { natural: "tree_row" }, geometry: g([[0, 0], [0.002, 0]]) },
        { type: "way", id: 7, tags: { building: "no" }, geometry: sq },
      ],
      "course-area"
    )
    expect(geo.features.map((f) => f.kind)).toEqual(["building", "scrub", "residential"])
    expect(geo.lines?.map((l) => l.kind)).toEqual(["road", "treeRow"])
    expect(geo.boundary).toBeNull()
  })

  it("stitches a boundary split across several ways, reversed or not, and drops rings that won't close", () => {
    const A = { lat: 0, lng: 0 }
    const B = { lat: 0, lng: 1 }
    const C = { lat: 1, lng: 1 }
    const D = { lat: 1, lng: 0 }
    const rings = joinRings([[A, B, C], [A, D, C]]) // second half runs the other way
    expect(rings).toHaveLength(1)
    expect(rings[0]).toEqual([A, B, C, D, A])
    expect(joinRings([[A, B, C]])).toEqual([])
  })

  it("reads a relation boundary's outer and inner rings", () => {
    const g = (pts: [number, number][]) => pts.map(([lat, lon]) => ({ lat, lon }))
    const shape = parseBoundaryShape([
      {
        type: "relation",
        id: 9,
        members: [
          { type: "way", role: "outer", geometry: g([[0, 0], [0, 2], [2, 2]]) },
          { type: "way", role: "outer", geometry: g([[2, 2], [2, 0], [0, 0]]) },
          { type: "way", role: "inner", geometry: g([[0.5, 0.5], [0.5, 1], [1, 1], [0.5, 0.5]]) },
        ],
      },
    ])
    expect(shape?.outer).toHaveLength(1)
    expect(shape?.outer[0]).toHaveLength(5)
    expect(shape?.inner).toHaveLength(1)
    expect(parseBoundaryShape([])).toBeNull()
  })
})

describe("spatial index (session 10: speed only)", () => {
  it("gives exactly the same lie and source as checking every shape, on 20,000 random points", () => {
    const r = seededRng(17)
    const rnd = (lo: number, hi: number) => lo + r() * (hi - lo)
    // A busy synthetic course: overlapping surfaces of every kind, a boundary with a hole cut out,
    // a wiggly coastline, roads, tree rows and user zones.
    const features: CourseFeature[] = []
    const kinds: CourseFeature["kind"][] = ["water", "range", "bunker", "green", "fairway", "tee", "trees", "building", "scrub", "residential"]
    for (let i = 0; i < 120; i++) {
      const cx = rnd(-400, 400)
      const cy = rnd(-100, 700)
      const n = 3 + Math.floor(r() * 8)
      const rad = rnd(5, 80)
      const ring = Array.from({ length: n }, (_, k) => {
        const t = (k / n) * 2 * Math.PI
        const rr = rad * rnd(0.5, 1.2)
        return at(cx + rr * Math.cos(t), cy + rr * Math.sin(t))
      })
      features.push({ kind: kinds[i % kinds.length], ring })
    }
    const coast = [Array.from({ length: 40 }, (_, k) => at(-600 + k * 30, -150 + 40 * Math.sin(k / 3)))]
    const zones = Array.from({ length: 6 }, (_, k) => ({
      id: `z${k}`,
      lie: (["trees", "oob", "fairway", "water", "rough", "bunker"] as const)[k],
      ring: rect(rnd(-300, 200), rnd(0, 500), rnd(210, 400), rnd(510, 700)),
    }))
    const extras = {
      boundary: { outer: [[...rect(-450, -120, 450, 720), at(-450, -120)]], inner: [[...rect(100, 100, 180, 200), at(100, 100)]] },
      lines: [
        { kind: "road" as const, line: Array.from({ length: 30 }, (_, k) => at(-500 + k * 35, 300 + 60 * Math.sin(k / 2))) },
        { kind: "treeRow" as const, line: [at(-200, -50), at(-150, 200), at(-180, 600)] },
      ],
    }
    const fast = buildLieMap(ORIGIN, features, coast, zones, extras)
    const slow = buildLieMap(ORIGIN, features, coast, zones, { ...extras, index: false })
    const lies = new Set<string>()
    for (let i = 0; i < 20000; i++) {
      const p = at(rnd(-700, 700), rnd(-400, 1000))
      const a = fast.classify(p)
      expect(a).toEqual(slow.classify(p))
      lies.add(`${a.lie}/${a.source}`)
    }
    expect(lies.size).toBeGreaterThanOrEqual(8) // the points really did cover most rules
  })
})
