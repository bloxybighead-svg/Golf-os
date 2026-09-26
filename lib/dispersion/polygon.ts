// Polygons live in YARD space (offlineYds, carryYds), not pixels, so
// point-in-polygon checks never depend on however the canvas happens to be
// scaled that day. The renderer transforms a polygon to pixels only when
// it draws it.

import type { YardPoint } from "./transform"

export interface YardPolygonPoint {
  offlineYds: number
  carryYds: number
}

/**
 * Standard ray-casting point-in-polygon test (even-odd rule). Treats
 * offlineYds as x and carryYds as y. Works for any simple polygon, convex
 * or not -- correctness doesn't depend on the fairway/green shape staying
 * a simple trapezoid once real course polygons replace the placeholder.
 */
export function pointInPolygon(point: YardPoint, polygon: YardPolygonPoint[]): boolean {
  const x = point.offlineYds
  const y = point.carryYds
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].offlineYds
    const yi = polygon[i].carryYds
    const xj = polygon[j].offlineYds
    const yj = polygon[j].carryYds
    const crosses = yi > y !== yj > y
    if (crosses) {
      const xIntersect = ((xj - xi) * (y - yi)) / (yj - yi) + xi
      if (x < xIntersect) inside = !inside
    }
  }
  return inside
}

export interface FairwayConfig {
  startYds: number // distance downrange where the fairway/target area begins
  endYds: number // distance downrange where it ends
  startWidthYds: number
  endWidthYds: number
  centerOffsetYds?: number // shifts the whole shape left/right, default 0
}

/**
 * A placeholder trapezoid fairway/range/green shape, narrow-to-wide (or
 * vice versa) downrange, centered on the target line by default. Stands
 * in for a real course polygon (GPS-traced fairway/green outline) until
 * that data exists -- pointInPolygon doesn't care which one it's given.
 */
export function makeFairwayPolygon(cfg: FairwayConfig): YardPolygonPoint[] {
  const offset = cfg.centerOffsetYds ?? 0
  const halfStart = cfg.startWidthYds / 2
  const halfEnd = cfg.endWidthYds / 2
  return [
    { offlineYds: offset - halfStart, carryYds: cfg.startYds },
    { offlineYds: offset + halfStart, carryYds: cfg.startYds },
    { offlineYds: offset + halfEnd, carryYds: cfg.endYds },
    { offlineYds: offset - halfEnd, carryYds: cfg.endYds },
  ]
}
