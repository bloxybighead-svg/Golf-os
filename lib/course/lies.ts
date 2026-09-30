// Classifies a landing point as water / out of bounds / bunker / green /
// fairway / trees / rough using the course map. First match wins:
//  1. User-drawn zones (see UserZone): the golfer standing there knows the
//     course better than OpenStreetMap does, and can correct a wrong map or
//     fill in what it's missing (trees, out of bounds, a hidden bunker, ...).
//  2. Mapped playing surfaces and hazards (water, driving range, bunker,
//     green, fairway, tee). These beat everything below, so a green drawn
//     slightly outside a sloppy course boundary is still a green.
//  3. The sea side of a coastline is water (before the boundary, or the
//     ocean past the course edge would count as out of bounds).
//  4. Outside the course boundary (or inside a hole cut out of it, usually
//     private homes) is out of bounds. Skipped when no boundary is mapped.
//  5. Buildings, and roads within ROAD_BUFFER_YDS, are out of bounds.
//  6. Woods, scrub, tree rows (within TREE_ROW_BUFFER_YDS) and -- only when a
//     boundary is mapped -- residential land inside it are trees (recovery).
//  7. Anything left is unmapped: rough within ROUGH_BAND_YDS of a fairway,
//     green or tee edge, trees beyond that. With no fairway, green or tee
//     mapped at all there is nothing to measure from, so it stays rough.
// Steps 1-6 are "mapped" lies; step 7 is "inferred" (guesswork), which the
// planner reports so the golfer knows how much of a pattern is a guess.

import { pointInRing, toLocal, type LatLng, type XY } from "./geo"
import type { CourseBoundaryShape, CourseFeature, CourseLine } from "./overpass"

export type Lie = "water" | "oob" | "bunker" | "green" | "fairway" | "trees" | "rough"

/** "mapped": the lie comes from the map or the golfer's marks. "inferred": unmapped ground, guessed by distance. */
export type LieSource = "mapped" | "inferred"

export interface LieClass {
  lie: Lie
  source: LieSource
}

/** A user-drawn area on the map, overriding the mapped/inferred lie inside it. */
export interface UserZone {
  id: string
  lie: Lie
  ring: LatLng[]
}

/**
 * How far off a fairway, green or tee edge unmapped ground still plays as
 * rough; beyond it, unmapped ground is treated as trees (recovery). ESTIMATE:
 * a typical first cut plus light rough on a parkland course is roughly 20-30
 * yd wide before the trees, houses or native areas start.
 */
export const ROUGH_BAND_YDS = 25

/** Roads are mapped as centre lines: a shot within this many yards of one is on the road (out of bounds). ESTIMATE: half a two-lane road. */
export const ROAD_BUFFER_YDS = 4

/** Tree rows are mapped as lines: within this many yards of one is in the trees. ESTIMATE: half a mature tree canopy. */
export const TREE_ROW_BUFFER_YDS = 6

export interface LieMap {
  lieAt(p: LatLng): Lie
  classify(p: LatLng): LieClass
}

export interface LieMapExtras {
  /** The course boundary. Outside it (or inside one of its holes) is out of bounds. */
  boundary?: CourseBoundaryShape | null
  /** Roads and tree rows, as centre lines. */
  lines?: CourseLine[]
  /** Use the spatial index (default). false checks every shape: the slow reference the index must match, for tests. */
  index?: boolean
}

interface PreparedRing {
  ring: XY[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

// Where two polygons overlap, the worse lie wins (a bunker cut into a
// fairway is a bunker; a green inside a fairway polygon is a green).
const SURFACES: { kind: CourseFeature["kind"]; lie: Lie }[] = [
  { kind: "water", lie: "water" },
  { kind: "range", lie: "oob" },
  { kind: "bunker", lie: "bunker" },
  { kind: "green", lie: "green" },
  { kind: "fairway", lie: "fairway" },
  { kind: "tee", lie: "fairway" },
]

/** Kinds whose edges unmapped ground is measured from (step 7). */
const EDGE_KINDS: CourseFeature["kind"][] = ["fairway", "green", "tee"]

const COAST_MAX_YDS = 1500 // farther than this from any coastline segment, don't guess

interface Segment {
  ax: number
  ay: number
  dx: number
  dy: number
  len2: number
}

/** Squared distance from (x, y) to a segment. */
function segDist2(x: number, y: number, s: Segment): number {
  const t = s.len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2))
  const px = s.ax + t * s.dx - x
  const py = s.ay + t * s.dy - y
  return px * px + py * py
}

function segmentsOf(pts: XY[], closed: boolean): Segment[] {
  const out: Segment[] = []
  const n = pts.length
  for (let i = 1; i < n + (closed ? 1 : 0); i++) {
    const a = pts[i - 1]
    const b = pts[i % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    out.push({ ax: a.x, ay: a.y, dx, dy, len2: dx * dx + dy * dy })
  }
  return out
}

/**
 * True when p is on the sea side (right-hand side, OSM convention) of the
 * nearest coastline segment. Each segment's left is land, so the nearest
 * segment gives the right answer for any point close to that stretch.
 */
function onSeaSide(x: number, y: number, segs: readonly Segment[]): boolean {
  let bestD2 = COAST_MAX_YDS * COAST_MAX_YDS
  let sea = false
  for (const s of segs) {
    const d2 = segDist2(x, y, s)
    if (d2 < bestD2) {
      bestD2 = d2
      // cross(direction, point - start) < 0  => point is to the right of the line
      sea = s.dx * (y - s.ay) - s.dy * (x - s.ax) < 0
    }
  }
  return sea
}

function prepare(origin: LatLng, ring: LatLng[]): PreparedRing {
  const xy = ring.map((p) => toLocal(origin, p))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of xy) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { ring: xy, minX, maxX, minY, maxY }
}

const inBox = (x: number, y: number, r: Box, pad = 0) =>
  x >= r.minX - pad && x <= r.maxX + pad && y >= r.minY - pad && y <= r.maxY + pad

const inRing = (x: number, y: number, r: PreparedRing) => inBox(x, y, r) && pointInRing(x, y, r.ring)

interface Box {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function segBox(s: Segment): Box {
  const bx = s.ax + s.dx
  const by = s.ay + s.dy
  return { minX: Math.min(s.ax, bx), maxX: Math.max(s.ax, bx), minY: Math.min(s.ay, by), maxY: Math.max(s.ay, by) }
}

// ---- Spatial index -------------------------------------------------------
// A lie lookup runs for every shot the planner simulates (hundreds of
// thousands per club ranking), and checking every mapped shape on the course
// each time was most of that cost. The index buckets shapes into square
// cells so a lookup only checks shapes whose (padded) bounding box touches
// the point's cell. It only skips shapes that could never match, so the
// answers are exactly the same as checking everything (lies.test.ts checks
// this against `index: false`).

/** Cell size of the spatial index, yards. A speed setting only: answers are identical at any size. */
const INDEX_CELL_YDS = 25

const NONE: readonly never[] = []
const cellOf = (v: number) => Math.floor(v / INDEX_CELL_YDS)
const cellKey = (ix: number, iy: number) => ix * 1_000_003 + iy

class Grid<T> {
  private readonly cells = new Map<number, T[]>()

  add(item: T, b: Box, pad = 0): void {
    for (let ix = cellOf(b.minX - pad); ix <= cellOf(b.maxX + pad); ix++) {
      for (let iy = cellOf(b.minY - pad); iy <= cellOf(b.maxY + pad); iy++) {
        const k = cellKey(ix, iy)
        const list = this.cells.get(k)
        if (list) list.push(item)
        else this.cells.set(k, [item])
      }
    }
  }

  /** Items come back in the order they were added, so "first match wins" rules still hold. */
  at(x: number, y: number): readonly T[] {
    return this.cells.get(cellKey(cellOf(x), cellOf(y))) ?? NONE
  }
}

interface Edge {
  xi: number
  yi: number
  xj: number
  yj: number
}

/**
 * Point-in-polygon for big rings (the course boundary has hundreds of
 * vertices): the same even-odd ray cast as geo.ts pointInRing, but only over
 * the edges whose height range covers the point's row band -- the only edges
 * that can cross the ray -- so the answer is identical.
 */
class BandedRing {
  private readonly bands = new Map<number, Edge[]>()
  private readonly box: Box

  constructor(r: PreparedRing) {
    this.box = r
    const ring = r.ring
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const e = { xi: ring[i].x, yi: ring[i].y, xj: ring[j].x, yj: ring[j].y }
      for (let b = cellOf(Math.min(e.yi, e.yj)); b <= cellOf(Math.max(e.yi, e.yj)); b++) {
        const list = this.bands.get(b)
        if (list) list.push(e)
        else this.bands.set(b, [e])
      }
    }
  }

  contains(x: number, y: number): boolean {
    if (!inBox(x, y, this.box)) return false
    let inside = false
    for (const e of this.bands.get(cellOf(y)) ?? NONE) {
      if (e.yi > y !== e.yj > y && x < ((e.xj - e.xi) * (y - e.yi)) / (e.yj - e.yi) + e.xi) inside = !inside
    }
    return inside
  }
}

/**
 * The coastline segments that could be the nearest one to some point in a
 * cell, in their original order: for any point p in a cell with centre c and
 * half-diagonal h, d(p, s) lies within d(c, s) +- h, so a segment more than
 * 2h farther from c than the closest one can never be nearest. Running
 * onSeaSide over just these gives the same answer as over the whole coast.
 * Worked out once per cell, the first time a point lands in it.
 */
class CoastIndex {
  private readonly cells = new Map<number, Segment[]>()

  constructor(private readonly segs: readonly Segment[]) {}

  candidates(x: number, y: number): readonly Segment[] {
    const ix = cellOf(x)
    const iy = cellOf(y)
    const k = cellKey(ix, iy)
    const hit = this.cells.get(k)
    if (hit) return hit
    const cx = (ix + 0.5) * INDEX_CELL_YDS
    const cy = (iy + 0.5) * INDEX_CELL_YDS
    const h = (INDEX_CELL_YDS * Math.SQRT2) / 2
    const d = this.segs.map((s) => Math.sqrt(segDist2(cx, cy, s)))
    const limit = Math.min(Math.min(...d) + 2 * h, COAST_MAX_YDS + h) + 1e-6
    const list = this.segs.filter((_, i) => d[i] <= limit)
    this.cells.set(k, list)
    return list
  }
}

type SegSet = "road" | "treeRow" | "edge"

export function buildLieMap(
  origin: LatLng,
  features: CourseFeature[],
  coast: LatLng[][] = [],
  zones: UserZone[] = [],
  extras: LieMapExtras = {}
): LieMap {
  // Most-recently-drawn zone wins where zones overlap, so check in reverse.
  const preparedZones = zones.map((z) => ({ lie: z.lie, ring: prepare(origin, z.ring) })).reverse()
  type PreparedZone = (typeof preparedZones)[number]

  const coastSegs: Segment[] = coast.flatMap((line) => segmentsOf(line.map((p) => toLocal(origin, p)), false))

  const byKind = new Map<string, PreparedRing[]>()
  for (const f of features) {
    const list = byKind.get(f.kind) ?? []
    list.push(prepare(origin, f.ring))
    byKind.set(f.kind, list)
  }

  const boundary = extras.boundary && extras.boundary.outer.length > 0 ? extras.boundary : null
  const outer = boundary?.outer.map((r) => prepare(origin, r)) ?? []
  const inner = boundary?.inner.map((r) => prepare(origin, r)) ?? []

  const segs: Record<SegSet, Segment[]> = { road: [], treeRow: [], edge: [] }
  for (const l of extras.lines ?? []) segs[l.kind].push(...segmentsOf(l.line.map((p) => toLocal(origin, p)), false))
  for (const f of features) {
    if (EDGE_KINDS.includes(f.kind)) segs.edge.push(...segmentsOf(f.ring.map((p) => toLocal(origin, p)), true))
  }
  const buffer: Record<SegSet, number> = { road: ROAD_BUFFER_YDS, treeRow: TREE_ROW_BUFFER_YDS, edge: ROUGH_BAND_YDS }

  // Candidates for a point: everything (index: false, the plain reference
  // version), or only what the point's index cell holds.
  let zonesAt = (_x: number, _y: number): readonly PreparedZone[] => preparedZones
  let ringsAt = (kind: CourseFeature["kind"], _x: number, _y: number): readonly PreparedRing[] => byKind.get(kind) ?? NONE
  let segsAt = (set: SegSet, _x: number, _y: number): readonly Segment[] => segs[set]
  let insideBoundary = (x: number, y: number) => outer.some((r) => inRing(x, y, r)) && !inner.some((r) => inRing(x, y, r))
  let coastAt = (_x: number, _y: number): readonly Segment[] => coastSegs

  if (extras.index ?? true) {
    const zoneGrid = new Grid<PreparedZone>()
    for (const z of preparedZones) zoneGrid.add(z, z.ring)
    const kindGrids = new Map<string, Grid<PreparedRing>>()
    byKind.forEach((rings, kind) => {
      const g = new Grid<PreparedRing>()
      for (const r of rings) g.add(r, r)
      kindGrids.set(kind, g)
    })
    const segGrids = {} as Record<SegSet, Grid<Segment>>
    for (const set of ["road", "treeRow", "edge"] as SegSet[]) {
      const g = new Grid<Segment>()
      for (const s of segs[set]) g.add(s, segBox(s), buffer[set])
      segGrids[set] = g
    }
    const outerBanded = outer.map((r) => new BandedRing(r))
    const innerBanded = inner.map((r) => new BandedRing(r))

    zonesAt = (x, y) => zoneGrid.at(x, y)
    ringsAt = (kind, x, y) => kindGrids.get(kind)?.at(x, y) ?? NONE
    segsAt = (set, x, y) => segGrids[set].at(x, y)
    insideBoundary = (x, y) => outerBanded.some((r) => r.contains(x, y)) && !innerBanded.some((r) => r.contains(x, y))
    const coastIndex = new CoastIndex(coastSegs)
    coastAt = (x, y) => coastIndex.candidates(x, y)
  }

  const inAny = (kind: CourseFeature["kind"], x: number, y: number) => ringsAt(kind, x, y).some((r) => inRing(x, y, r))
  const near = (set: SegSet, x: number, y: number) => {
    const d2 = buffer[set] * buffer[set]
    return segsAt(set, x, y).some((s) => segDist2(x, y, s) <= d2)
  }
  const mapped = (lie: Lie): LieClass => ({ lie, source: "mapped" })

  function classify(p: LatLng): LieClass {
    const { x, y } = toLocal(origin, p)
    for (const z of zonesAt(x, y)) if (inRing(x, y, z.ring)) return mapped(z.lie)
    for (const { kind, lie } of SURFACES) if (inAny(kind, x, y)) return mapped(lie)
    if (coastSegs.length > 0 && onSeaSide(x, y, coastAt(x, y))) return mapped("water")
    if (boundary && !insideBoundary(x, y)) return mapped("oob")
    if (inAny("building", x, y) || near("road", x, y)) return mapped("oob")
    if (inAny("trees", x, y) || inAny("scrub", x, y) || near("treeRow", x, y)) return mapped("trees")
    if (boundary && inAny("residential", x, y)) return mapped("trees")
    if (segs.edge.length === 0) return { lie: "rough", source: "inferred" }
    return { lie: near("edge", x, y) ? "rough" : "trees", source: "inferred" }
  }

  return {
    classify,
    lieAt: (p) => classify(p).lie,
  }
}
