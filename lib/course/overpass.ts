// Turns OpenStreetMap golf mapping (fetched through the Overpass API) into
// the small course model the map page uses. OSM golf tagging:
// https://wiki.openstreetmap.org/wiki/Golf  (data (c) OpenStreetMap
// contributors, ODbL). Coverage varies a lot by course -- some have every
// bunker traced, some only the hole centerlines -- so the parser reports
// what it found instead of assuming.

import { distanceYds, pointInRing, toLocal, type LatLng } from "./geo"

// "trees": mapped woods/forest (punch-out or lost ball). "range": driving range
// or practice area -- out of play, treated as out of bounds. "building":
// out of bounds. "scrub" and "residential" (gardens, only counted inside the
// course boundary) play as trees -- see lies.ts for the full order.
export type FeatureKind =
  | "green"
  | "fairway"
  | "bunker"
  | "water"
  | "tee"
  | "trees"
  | "range"
  | "building"
  | "scrub"
  | "residential"

/**
 * Bump when the shape or meaning of CourseGeometry changes; older cached rows are refetched.
 * 4 (2026-09-30): course boundary, buildings, roads, scrub, tree rows, residential.
 */
export const GEOMETRY_VERSION = 4

export interface CourseFeature {
  kind: FeatureKind
  ring: LatLng[]
}

/** Mapped as centre lines, not areas: roads (out of bounds) and tree rows (trees). */
export type LineKind = "road" | "treeRow"

export interface CourseLine {
  kind: LineKind
  line: LatLng[]
}

/** The course's leisure=golf_course outline: outer rings, minus holes cut out of it (usually private homes). */
export interface CourseBoundaryShape {
  outer: LatLng[][]
  inner: LatLng[][]
}

export type CorrectableField = "par" | "tee_lat" | "tee_lng" | "yardage" | "handicap"

export interface CourseHole {
  id: string
  ref: number | null // hole number as tagged in OSM
  par: number | null
  line: LatLng[] // tee -> green centerline
  /** Stroke index (1-18, how hard the hole plays relative to the others) -- not tagged
   * in OSM at all, so this only ever comes from a golfer's own correction. */
  strokeIndex?: number | null
  /** Tee-to-green yardage. Not tagged in OSM either; absent unless corrected (the map already
   * shows live, precise ball/pin distances -- this is just a scorecard-style display number). */
  yardageYds?: number | null
  /** Which fields (if any) a golfer has corrected for this hole -- drives the "corrected" badge. */
  correctedFields?: CorrectableField[]
}

export interface CourseGeometry {
  holes: CourseHole[]
  features: CourseFeature[]
  /**
   * OSM coastline ways. Each is a directed line with the sea on its RIGHT
   * (OSM convention), so the ocean needs no polygon of its own.
   */
  coast: LatLng[][]
  /** Roads and tree rows. Optional: absent from geometry built before version 4. */
  lines?: CourseLine[]
  /** The chosen course's boundary; null in the radius fallback (no boundary chosen) or when it couldn't be assembled. */
  boundary?: CourseBoundaryShape | null
  scope: "course-area" | "radius" // how the features were selected
  version: number
}

interface OverpassGeomPoint {
  lat: number
  lon: number
}

interface OverpassMember {
  type: string
  role?: string
  geometry?: OverpassGeomPoint[]
}

export interface OverpassElement {
  type: "way" | "relation" | "node"
  id: number
  tags?: Record<string, string>
  geometry?: OverpassGeomPoint[]
  members?: OverpassMember[]
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

function toLatLngs(points: OverpassGeomPoint[]): LatLng[] {
  return points.map((p) => ({ lat: round6(p.lat), lng: round6(p.lon) }))
}

function featureKind(tags: Record<string, string>): FeatureKind | null {
  switch (tags.golf) {
    case "green":
      return "green"
    case "fairway":
      return "fairway"
    case "bunker":
      return "bunker"
    case "tee":
      return "tee"
    case "water_hazard":
    case "lateral_water_hazard":
      return "water"
    case "driving_range":
      return "range"
  }
  if (tags.natural === "water") return "water"
  if (tags.natural === "wood" || tags.landuse === "forest") return "trees"
  if (tags.building && tags.building !== "no") return "building"
  if (tags.natural === "scrub") return "scrub"
  if (tags.landuse === "residential") return "residential"
  return null
}

// highway=* values that aren't roads a ball would be out of bounds on:
// walking paths between holes are often not tagged golf=cartpath, and
// treating them as out of bounds would be badly wrong.
const NOT_ROADS = new Set([
  "footway",
  "path",
  "steps",
  "pedestrian",
  "track",
  "bridleway",
  "cycleway",
  "corridor",
  "proposed",
  "construction",
  "platform",
])

/** A mapped road (out of bounds), not a cart path, walking path or tunnel. */
export function isRoad(tags: Record<string, string>): boolean {
  if (!tags.highway || NOT_ROADS.has(tags.highway)) return false
  if (tags.golf === "cartpath" || tags.golf_cart === "designated") return false
  if (tags.area === "yes" || (tags.tunnel && tags.tunnel !== "no")) return false
  return true
}

/**
 * Stitches ways that share end points into closed rings (a multipolygon's
 * outline is often split into several ways). Rings that can't be closed are
 * dropped: an open one would draw a false edge across the course.
 */
export function joinRings(ways: LatLng[][]): LatLng[][] {
  const same = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng
  const left = ways.filter((w) => w.length >= 2).map((w) => [...w])
  const rings: LatLng[][] = []
  while (left.length > 0) {
    let ring = left.shift() as LatLng[]
    while (!same(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1]
      const i = left.findIndex((w) => same(w[0], end) || same(w[w.length - 1], end))
      if (i < 0) break
      const [next] = left.splice(i, 1)
      ring = ring.concat((same(next[0], end) ? next : [...next].reverse()).slice(1))
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring)
  }
  return rings
}

/** The course outline from `boundaryGeometryQuery`'s answer, or null if it can't be closed. */
export function parseBoundaryShape(elements: OverpassElement[]): CourseBoundaryShape | null {
  const outerWays: LatLng[][] = []
  const innerWays: LatLng[][] = []
  for (const el of elements) {
    if (el.type === "way" && el.geometry) outerWays.push(toLatLngs(el.geometry))
    if (el.type === "relation" && el.members) {
      for (const m of el.members) {
        if (m.type !== "way" || !m.geometry) continue
        ;(m.role === "inner" ? innerWays : outerWays).push(toLatLngs(m.geometry))
      }
    }
  }
  const outer = joinRings(outerWays)
  return outer.length > 0 ? { outer, inner: joinRings(innerWays) } : null
}

export function parseOverpass(elements: OverpassElement[], scope: CourseGeometry["scope"]): CourseGeometry {
  const holes: CourseHole[] = []
  const features: CourseFeature[] = []
  const lines: CourseLine[] = []

  for (const el of elements) {
    const tags = el.tags ?? {}

    if (el.type === "way" && el.geometry && el.geometry.length >= 2 && (isRoad(tags) || tags.natural === "tree_row")) {
      lines.push({ kind: tags.natural === "tree_row" ? "treeRow" : "road", line: toLatLngs(el.geometry) })
      continue
    }
    if (tags.highway) continue // cart paths and walking paths: not a lie of their own

    if (el.type === "way" && tags.golf === "hole" && el.geometry && el.geometry.length >= 2) {
      const ref = parseInt(tags.ref ?? "", 10)
      const par = parseInt(tags.par ?? "", 10)
      holes.push({
        id: `way/${el.id}`,
        ref: Number.isFinite(ref) ? ref : null,
        par: Number.isFinite(par) ? par : null,
        line: toLatLngs(el.geometry),
        strokeIndex: null,
        yardageYds: null,
        correctedFields: [],
      })
      continue
    }

    const kind = featureKind(tags)
    if (!kind) continue

    if (el.type === "way" && el.geometry && el.geometry.length >= 3) {
      features.push({ kind, ring: toLatLngs(el.geometry) })
    } else if (el.type === "relation" && el.members) {
      // Multipolygon: use each outer ring. Inner rings (islands) are
      // ignored, which slightly overstates a lake's extent -- acceptable
      // for a hazard estimate, and noted in the UI.
      for (const m of el.members) {
        if (m.type === "way" && m.role === "outer" && m.geometry && m.geometry.length >= 3) {
          features.push({ kind, ring: toLatLngs(m.geometry) })
        }
      }
    }
  }

  holes.sort((a, b) => (a.ref ?? 999) - (b.ref ?? 999))
  markPracticeAreas(holes, features)
  return { holes, features, coast: [], lines, boundary: null, scope, version: GEOMETRY_VERSION }
}

const ORPHAN_SAMPLE_YDS = 10
const ORPHAN_NEAR_YDS = 20

/**
 * OSM has no reliable tag for a range's landing area -- mappers often draw it
 * as golf=fairway. A real fairway has a hole centerline running through (or
 * right beside) it, so a "fairway" that no centerline touches is a practice
 * area: reclassify it as "range" (out of play). Skipped when no hole lines
 * are mapped, since then there is nothing to compare against.
 */
export function markPracticeAreas(holes: CourseHole[], features: CourseFeature[]): void {
  if (holes.length === 0) return
  const samples: LatLng[] = []
  for (const h of holes) {
    for (let i = 1; i < h.line.length; i++) {
      const a = h.line[i - 1]
      const b = h.line[i]
      const len = distanceYds(a, b)
      const n = Math.max(1, Math.ceil(len / ORPHAN_SAMPLE_YDS))
      for (let k = 0; k <= n; k++) {
        const t = k / n
        samples.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
      }
    }
  }
  for (const f of features) {
    if (f.kind !== "fairway") continue
    const origin = f.ring[0]
    const ring = f.ring.map((p) => toLocal(origin, p))
    const touched = samples.some((s) => {
      const q = toLocal(origin, s)
      if (pointInRing(q.x, q.y, ring)) return true
      return ring.some((v) => Math.hypot(v.x - q.x, v.y - q.y) < ORPHAN_NEAR_YDS)
    })
    if (!touched) f.kind = "range"
  }
}

/** Nearby golf_course boundaries (with bounding boxes), used to pick the right course. */
export function boundaryQuery(lat: number, lng: number, radiusM: number): string {
  return `[out:json][timeout:25];
(
  way(around:${radiusM},${lat},${lng})["leisure"="golf_course"];
  relation(around:${radiusM},${lat},${lng})["leisure"="golf_course"];
);
out tags bb;`
}

export interface CourseBoundary {
  type: "way" | "relation"
  id: number
  name: string | null
  bounds: { minlat: number; minlon: number; maxlat: number; maxlon: number }
}

export function parseBoundaries(elements: (OverpassElement & { bounds?: CourseBoundary["bounds"] })[]): CourseBoundary[] {
  const out: CourseBoundary[] = []
  for (const e of elements) {
    if ((e.type !== "way" && e.type !== "relation") || !e.bounds) continue
    out.push({ type: e.type, id: e.id, name: e.tags?.name ?? null, bounds: e.bounds })
  }
  return out
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(golf|club|course|links|country|the|and|at)\b/g, " ").replace(/\s+/g, " ").trim()

/**
 * Choose which mapped course a search hit refers to. A boundary that
 * contains the point wins; among those (resorts stack several courses on
 * one site) prefer a name match, then the smallest area. With no
 * containing boundary, take the nearest by centre.
 */
export function pickBoundary(cands: CourseBoundary[], lat: number, lng: number, courseName?: string): CourseBoundary | null {
  if (cands.length === 0) return null
  const want = courseName ? norm(courseName) : ""
  const scored = cands.map((c) => {
    const b = c.bounds
    const margin = 0.0004
    const contains = lat >= b.minlat - margin && lat <= b.maxlat + margin && lng >= b.minlon - margin && lng <= b.maxlon + margin
    const cn = c.name ? norm(c.name) : ""
    const nameMatch = !!want && !!cn && (cn.includes(want) || want.includes(cn)) ? 1 : 0
    const area = (b.maxlat - b.minlat) * (b.maxlon - b.minlon)
    const dist = Math.hypot((b.minlat + b.maxlat) / 2 - lat, (b.minlon + b.maxlon) / 2 - lng)
    return { c, contains: contains ? 1 : 0, nameMatch, area, dist }
  })
  scored.sort((a, b) => b.nameMatch - a.nameMatch || b.contains - a.contains || (a.contains ? a.area - b.area : a.dist - b.dist))
  return scored[0].c
}

const GOLF_TYPES = "hole|green|fairway|bunker|tee|water_hazard|lateral_water_hazard|driving_range"

/**
 * Step 1 of loading a course: the ids of every mapped golf way (and water,
 * woods, scrub, tree rows, residential land, buildings and roads) inside one
 * course boundary. Ids only, because Overpass's public servers reject
 * "area + full geometry" queries under load but answer this one. Large lakes
 * mapped as multipolygon relations are not included; the relation queries
 * that would fetch them time out on the public servers.
 */
export function courseWayIdsQuery(b: Pick<CourseBoundary, "type" | "id">): string {
  const areaId = (b.type === "way" ? 2400000000 : 3600000000) + b.id
  return `[out:json][timeout:40];
area(${areaId})->.c;
(
  way(area.c)["golf"~"^(${GOLF_TYPES})$"];
  way(area.c)["natural"~"^(water|wood|scrub|tree_row)$"];
  way(area.c)["landuse"~"^(forest|residential)$"];
  way(area.c)["building"];
  way(area.c)["highway"];
);
out ids;`
}

/** The chosen course boundary's own outline (a relation's member ways come with it). */
export function boundaryGeometryQuery(b: Pick<CourseBoundary, "type" | "id">): string {
  return `[out:json][timeout:25];
${b.type}(id:${b.id});
out geom;`
}

/** Step 2: full geometry for those ways. */
export function courseGeometryQuery(wayIds: number[]): string {
  return `[out:json][timeout:40];
way(id:${wayIds.join(",")});
out geom tags;`
}

/**
 * Fallback when no course boundary is mapped: everything within radiusM.
 * No residential land here -- without a boundary there's no telling the
 * course's own grounds from the neighbours', so it isn't used.
 */
export function radiusQuery(lat: number, lng: number, radiusM: number): string {
  return `[out:json][timeout:40];
(
  way(around:${radiusM},${lat},${lng})["golf"];
  way(around:${radiusM},${lat},${lng})["natural"~"^(water|wood|scrub|tree_row)$"];
  way(around:${radiusM},${lat},${lng})["landuse"="forest"];
  way(around:${radiusM},${lat},${lng})["building"];
  way(around:${radiusM},${lat},${lng})["highway"];
  relation(around:${radiusM},${lat},${lng})["natural"="water"];
);
out geom tags;`
}

/** Coastline ways within a course's bounding box (geometry clipped to the box). */
export function coastQuery(b: CourseBoundary["bounds"], padDeg = 0.003): string {
  const bbox = `${b.minlat - padDeg},${b.minlon - padDeg},${b.maxlat + padDeg},${b.maxlon + padDeg}`
  return `[out:json][timeout:40];
way["natural"="coastline"](${bbox});
out geom(${bbox}) tags;`
}

export function parseCoast(elements: OverpassElement[]): LatLng[][] {
  // `out geom(bbox)` returns null for vertices outside the box; split the
  // way there instead of drawing a false chord across the gap.
  const lines: LatLng[][] = []
  for (const e of elements) {
    if (e.type !== "way" || !e.geometry) continue
    let cur: LatLng[] = []
    for (const p of e.geometry as (OverpassGeomPoint | null)[]) {
      if (p) {
        cur.push({ lat: round6(p.lat), lng: round6(p.lon) })
      } else {
        if (cur.length >= 2) lines.push(cur)
        cur = []
      }
    }
    if (cur.length >= 2) lines.push(cur)
  }
  return lines
}
