// Ground height around a hole, for "plays like" distances. The server looks up a
// few dozen points along the hole once (app/api/elevation, cached forever in
// Supabase); here they become a small raster that the shot simulation can read
// in constant time, so the ranking stays fast. Plain data throughout: the field
// is posted to the ranking worker as is.

import { fromLocal, pointAlongLine, lineLengthYds, toLocal, type LatLng } from "./geo"

export interface ElevationPoint extends LatLng {
  ft: number
}

export interface ElevationField {
  /** Identifies the points the field was built from (part of the ranking's cache key). */
  id: string
  origin: LatLng
  /** Cell size, yards. */
  cellYds: number
  /** West and south edges of the raster, yards from the origin. */
  minX: number
  minY: number
  nx: number
  ny: number
  /** Row-major (y rows of x cells) height in feet at each raster node. */
  ft: number[]
}

/** The elevation route takes at most this many points per request. Matches the route's own limit. */
export const ELEVATION_MAX_POINTS = 50

/** Spacing of the sample stations along the hole line, yards. ESTIMATE: fine enough to catch a ridge or a swale, coarse enough for 3 across to fit in 50 points. */
export const ELEVATION_STATION_YDS = 35

/** Stations per hole are capped so 3 points across stay within ELEVATION_MAX_POINTS. */
export const ELEVATION_MAX_STATIONS = 16

/** How far either side of the hole line the samples reach, yards. ESTIMATE: about a fairway plus its rough. */
export const ELEVATION_LATERAL_YDS = 35

/** The raster extends this far past the sampled points, yards, so a shot landing a little off the line still reads a height. Beyond it the ground counts as flat (null). ESTIMATE. */
export const ELEVATION_MARGIN_YDS = 45

/** Raster cell size, yards. A SPEED/ACCURACY setting: smaller is smoother and slower to build. */
export const ELEVATION_CELL_YDS = 10

/** Inverse-distance weighting power when the points are turned into a raster. A common default (2). */
const IDW_POWER = 2

/** Points each raster node is interpolated from. ESTIMATE: enough to span a station's three points and its neighbours. */
const IDW_NEIGHBOURS = 8

/**
 * Where to look up the ground height for a hole: stations along its centreline
 * (tee and green included), each with one point on either side. At most
 * ELEVATION_MAX_POINTS; the same line always gives the same points, which is how
 * a cached answer is matched to the request.
 */
export function holeSamplePoints(line: LatLng[]): LatLng[] {
  if (line.length < 2) return line.slice(0, 1)
  const length = lineLengthYds(line)
  const stations = Math.max(2, Math.min(ELEVATION_MAX_STATIONS, Math.round(length / ELEVATION_STATION_YDS) + 1))
  const out: LatLng[] = []
  for (let i = 0; i < stations; i++) {
    const s = (length * i) / (stations - 1)
    const at = pointAlongLine(line, s)
    out.push(at)
    // The line's direction here, from a point just behind to one just ahead.
    const a = toLocal(at, pointAlongLine(line, Math.max(0, s - 3)))
    const b = toLocal(at, pointAlongLine(line, Math.min(length, s + 3)))
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    // Perpendicular (left of travel, then right).
    const px = -dy / len
    const py = dx / len
    out.push(fromLocal(at, { x: px * ELEVATION_LATERAL_YDS, y: py * ELEVATION_LATERAL_YDS }))
    out.push(fromLocal(at, { x: -px * ELEVATION_LATERAL_YDS, y: -py * ELEVATION_LATERAL_YDS }))
  }
  return out.slice(0, ELEVATION_MAX_POINTS)
}

/** The same points: equal within about a foot. Used to decide whether a saved answer still fits the hole. */
export function samePoints(a: LatLng[], b: LatLng[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => Math.abs(p.lat - b[i].lat) < 1e-5 && Math.abs(p.lng - b[i].lng) < 1e-5)
}

/** Interpolates the looked-up points into a raster. Null with fewer than 3 usable points. */
export function buildElevationField(points: ElevationPoint[]): ElevationField | null {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.ft))
  if (pts.length < 3) return null
  const origin = pts[0]
  const local = pts.map((p) => ({ ...toLocal(origin, p), ft: p.ft }))
  const minX = Math.min(...local.map((p) => p.x)) - ELEVATION_MARGIN_YDS
  const maxX = Math.max(...local.map((p) => p.x)) + ELEVATION_MARGIN_YDS
  const minY = Math.min(...local.map((p) => p.y)) - ELEVATION_MARGIN_YDS
  const maxY = Math.max(...local.map((p) => p.y)) + ELEVATION_MARGIN_YDS
  const nx = Math.ceil((maxX - minX) / ELEVATION_CELL_YDS) + 1
  const ny = Math.ceil((maxY - minY) / ELEVATION_CELL_YDS) + 1
  const ft: number[] = new Array(nx * ny)
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = minX + ix * ELEVATION_CELL_YDS
      const y = minY + iy * ELEVATION_CELL_YDS
      // Inverse-distance weighting over the nearest few points: using all of them pulls every cell toward the average height and flattens real slopes.
      const near = local
        .map((p) => ({ d2: (p.x - x) ** 2 + (p.y - y) ** 2, ft: p.ft }))
        .sort((p, q) => p.d2 - q.d2)
        .slice(0, IDW_NEIGHBOURS)
      let num = 0
      let den = 0
      let exact: number | null = null
      for (const p of near) {
        if (p.d2 < 1e-6) {
          exact = p.ft
          break
        }
        const w = 1 / p.d2 ** (IDW_POWER / 2)
        num += w * p.ft
        den += w
      }
      ft[iy * nx + ix] = exact ?? num / den
    }
  }
  const id = `${pts.length}:${Math.round(pts.reduce((a, p) => a + p.ft, 0))}:${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`
  return { id, origin, cellYds: ELEVATION_CELL_YDS, minX, minY, nx, ny, ft }
}

/** Ground height in feet at a point (bilinear), or null when it is off the raster (treated as flat by the caller). */
export function elevationAt(field: ElevationField, p: LatLng): number | null {
  const { x, y } = toLocal(field.origin, p)
  const fx = (x - field.minX) / field.cellYds
  const fy = (y - field.minY) / field.cellYds
  if (fx < 0 || fy < 0 || fx > field.nx - 1 || fy > field.ny - 1) return null
  const ix = Math.min(Math.floor(fx), field.nx - 2)
  const iy = Math.min(Math.floor(fy), field.ny - 2)
  const tx = fx - ix
  const ty = fy - iy
  const a = field.ft[iy * field.nx + ix]
  const b = field.ft[iy * field.nx + ix + 1]
  const c = field.ft[(iy + 1) * field.nx + ix]
  const d = field.ft[(iy + 1) * field.nx + ix + 1]
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
}
