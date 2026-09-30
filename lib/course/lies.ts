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
function onSeaSide(x: number, y: number, segs: Segment[]): boolean {
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

const inBox = (x: number, y: number, r: PreparedRing, pad = 0) =>
  x >= r.minX - pad && x <= r.maxX + pad && y >= r.minY - pad && y <= r.maxY + pad

const inRing = (x: number, y: number, r: PreparedRing) => inBox(x, y, r) && pointInRing(x, y, r.ring)

/** A polyline (road, tree row, or a ring's edges) with its bounding box, for "within N yards" tests. */
interface PreparedLine {
  segs: Segment[]
  box: PreparedRing
}

function prepareLine(origin: LatLng, line: LatLng[], closed: boolean): PreparedLine {
  const box = prepare(origin, line)
  return { segs: segmentsOf(box.ring, closed), box }
}

function nearLine(x: number, y: number, l: PreparedLine, yds: number): boolean {
  if (!inBox(x, y, l.box, yds)) return false
  const d2 = yds * yds
  return l.segs.some((s) => segDist2(x, y, s) <= d2)
}

export function buildLieMap(
  origin: LatLng,
  features: CourseFeature[],
  coast: LatLng[][] = [],
  zones: UserZone[] = [],
  extras: LieMapExtras = {}
): LieMap {
  // Most-recently-drawn zone wins where zones overlap, so check in reverse.
  const preparedZones = zones.map((z) => ({ lie: z.lie, prepared: prepare(origin, z.ring) })).reverse()

  const coastSegs: Segment[] = coast.flatMap((line) => segmentsOf(line.map((p) => toLocal(origin, p)), false))

  const byKind = new Map<string, PreparedRing[]>()
  for (const f of features) {
    const list = byKind.get(f.kind) ?? []
    list.push(prepare(origin, f.ring))
    byKind.set(f.kind, list)
  }
  const ringsOf = (kind: CourseFeature["kind"]) => byKind.get(kind) ?? []

  const boundary = extras.boundary && extras.boundary.outer.length > 0 ? extras.boundary : null
  const outer = boundary?.outer.map((r) => prepare(origin, r)) ?? []
  const inner = boundary?.inner.map((r) => prepare(origin, r)) ?? []

  const roads: PreparedLine[] = []
  const treeRows: PreparedLine[] = []
  for (const l of extras.lines ?? []) {
    ;(l.kind === "road" ? roads : treeRows).push(prepareLine(origin, l.line, false))
  }

  const edges: PreparedLine[] = features
    .filter((f) => EDGE_KINDS.includes(f.kind))
    .map((f) => prepareLine(origin, f.ring, true))

  const mapped = (lie: Lie): LieClass => ({ lie, source: "mapped" })

  function classify(p: LatLng): LieClass {
    const { x, y } = toLocal(origin, p)
    for (const { lie, prepared: r } of preparedZones) if (inRing(x, y, r)) return mapped(lie)
    for (const { kind, lie } of SURFACES) for (const r of ringsOf(kind)) if (inRing(x, y, r)) return mapped(lie)
    if (coastSegs.length > 0 && onSeaSide(x, y, coastSegs)) return mapped("water")
    if (boundary) {
      const inside = outer.some((r) => inRing(x, y, r)) && !inner.some((r) => inRing(x, y, r))
      if (!inside) return mapped("oob")
    }
    if (ringsOf("building").some((r) => inRing(x, y, r))) return mapped("oob")
    if (roads.some((l) => nearLine(x, y, l, ROAD_BUFFER_YDS))) return mapped("oob")
    if (ringsOf("trees").some((r) => inRing(x, y, r)) || ringsOf("scrub").some((r) => inRing(x, y, r))) return mapped("trees")
    if (treeRows.some((l) => nearLine(x, y, l, TREE_ROW_BUFFER_YDS))) return mapped("trees")
    if (boundary && ringsOf("residential").some((r) => inRing(x, y, r))) return mapped("trees")
    if (edges.length === 0) return { lie: "rough", source: "inferred" }
    const nearEdge = edges.some((l) => nearLine(x, y, l, ROUGH_BAND_YDS))
    return { lie: nearEdge ? "rough" : "trees", source: "inferred" }
  }

  return {
    classify,
    lieAt: (p) => classify(p).lie,
  }
}
