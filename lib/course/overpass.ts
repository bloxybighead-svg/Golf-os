// Turns OpenStreetMap golf mapping (fetched through the Overpass API) into
// the small course model the map page uses. OSM golf tagging:
// https://wiki.openstreetmap.org/wiki/Golf  (data (c) OpenStreetMap
// contributors, ODbL). Coverage varies a lot by course -- some have every
// bunker traced, some only the hole centerlines -- so the parser reports
// what it found instead of assuming.

import type { LatLng } from "./geo"

export type FeatureKind = "green" | "fairway" | "bunker" | "water" | "tee"

export interface CourseFeature {
  kind: FeatureKind
  ring: LatLng[]
}

export interface CourseHole {
  id: string
  ref: number | null // hole number as tagged in OSM
  par: number | null
  line: LatLng[] // tee -> green centerline
}

export interface CourseGeometry {
  holes: CourseHole[]
  features: CourseFeature[]
  /**
   * OSM coastline ways. Each is a directed line with the sea on its RIGHT
   * (OSM convention), so the ocean needs no polygon of its own.
   */
  coast: LatLng[][]
  scope: "course-area" | "radius" // how the features were selected
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
  }
  if (tags.natural === "water") return "water"
  return null
}

export function parseOverpass(elements: OverpassElement[], scope: CourseGeometry["scope"]): CourseGeometry {
  const holes: CourseHole[] = []
  const features: CourseFeature[] = []

  for (const el of elements) {
    const tags = el.tags ?? {}

    if (el.type === "way" && tags.golf === "hole" && el.geometry && el.geometry.length >= 2) {
      const ref = parseInt(tags.ref ?? "", 10)
      const par = parseInt(tags.par ?? "", 10)
      holes.push({
        id: `way/${el.id}`,
        ref: Number.isFinite(ref) ? ref : null,
        par: Number.isFinite(par) ? par : null,
        line: toLatLngs(el.geometry),
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
  return { holes, features, coast: [], scope }
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

const GOLF_TYPES = "hole|green|fairway|bunker|tee|water_hazard|lateral_water_hazard"

/**
 * Step 1 of loading a course: the ids of every mapped golf way (and water
 * way) inside one course boundary. Ids only, because Overpass's public
 * servers reject "area + full geometry" queries under load but answer this
 * one. Large lakes mapped as multipolygon relations are not included; the
 * relation queries that would fetch them time out on the public servers.
 */
export function courseWayIdsQuery(b: Pick<CourseBoundary, "type" | "id">): string {
  const areaId = (b.type === "way" ? 2400000000 : 3600000000) + b.id
  return `[out:json][timeout:40];
area(${areaId})->.c;
(
  way(area.c)["golf"~"^(${GOLF_TYPES})$"];
  way(area.c)["natural"="water"];
);
out ids;`
}

/** Step 2: full geometry for those ways. */
export function courseGeometryQuery(wayIds: number[]): string {
  return `[out:json][timeout:40];
way(id:${wayIds.join(",")});
out geom tags;`
}

/** Fallback when no course boundary is mapped: everything within radiusM. */
export function radiusQuery(lat: number, lng: number, radiusM: number): string {
  return `[out:json][timeout:40];
(
  way(around:${radiusM},${lat},${lng})["golf"];
  way(around:${radiusM},${lat},${lng})["natural"="water"];
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
