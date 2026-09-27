// Classifies a landing point as water / bunker / green / fairway / rough
// using the course polygons. Anything not inside a mapped polygon is
// "rough" -- so on a sparsely mapped course the rough share is inflated.
// Coastline (sea on the right of each way) counts as water.
//
// User-drawn zones (see UserZone) take priority over everything else,
// including the mapped course polygons: the golfer standing there knows the
// course better than OpenStreetMap does, and can correct a wrong map or fill
// in what it's missing (trees, out of bounds, a hidden bunker, ...).

import { pointInRing, toLocal, type LatLng, type XY } from "./geo"
import type { CourseFeature } from "./overpass"

export type Lie = "water" | "oob" | "bunker" | "green" | "fairway" | "trees" | "rough"

/** A user-drawn area on the map, overriding the mapped/inferred lie inside it. */
export interface UserZone {
  id: string
  lie: Lie
  ring: LatLng[]
}

interface PreparedRing {
  ring: XY[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface LieMap {
  lieAt(p: LatLng): Lie
}

// Where two polygons overlap, the worse lie wins (a bunker cut into a
// fairway is a bunker; a green inside a fairway polygon is a green).
const PRIORITY: { kind: CourseFeature["kind"]; lie: Lie }[] = [
  { kind: "water", lie: "water" },
  { kind: "range", lie: "oob" },
  { kind: "bunker", lie: "bunker" },
  { kind: "green", lie: "green" },
  { kind: "fairway", lie: "fairway" },
  { kind: "tee", lie: "fairway" },
  { kind: "trees", lie: "trees" }, // mapped woods only lose to real playing surfaces
]

const COAST_MAX_YDS = 1500 // farther than this from any coastline segment, don't guess

interface Segment {
  ax: number
  ay: number
  dx: number
  dy: number
  len2: number
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
    const t = s.len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2))
    const px = s.ax + t * s.dx - x
    const py = s.ay + t * s.dy - y
    const d2 = px * px + py * py
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

export function buildLieMap(
  origin: LatLng,
  features: CourseFeature[],
  coast: LatLng[][] = [],
  zones: UserZone[] = []
): LieMap {
  // Most-recently-drawn zone wins where zones overlap, so check in reverse.
  const preparedZones = zones.map((z) => ({ lie: z.lie, prepared: prepare(origin, z.ring) })).reverse()

  const segs: Segment[] = []
  for (const line of coast) {
    const pts = line.map((p) => toLocal(origin, p))
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x
      const dy = pts[i].y - pts[i - 1].y
      segs.push({ ax: pts[i - 1].x, ay: pts[i - 1].y, dx, dy, len2: dx * dx + dy * dy })
    }
  }
  const byKind = new Map<string, PreparedRing[]>()
  for (const f of features) {
    const list = byKind.get(f.kind) ?? []
    list.push(prepare(origin, f.ring))
    byKind.set(f.kind, list)
  }

  return {
    lieAt(p: LatLng): Lie {
      const { x, y } = toLocal(origin, p)
      for (const { lie, prepared: r } of preparedZones) {
        if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) continue
        if (pointInRing(x, y, r.ring)) return lie
      }
      for (const { kind, lie } of PRIORITY) {
        for (const r of byKind.get(kind) ?? []) {
          if (x < r.minX || x > r.maxX || y < r.minY || y > r.maxY) continue
          if (pointInRing(x, y, r.ring)) return lie
        }
      }
      if (segs.length > 0 && onSeaSide(x, y, segs)) return "water"
      return "rough"
    },
  }
}
