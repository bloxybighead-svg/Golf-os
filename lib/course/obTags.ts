// Out-of-bounds stakes the map doesn't have. OpenStreetMap often draws the
// course boundary around everything, so stakes between two holes, or along a
// road inside the course, are missing and a shot over them scores as ordinary
// rough. The golfer taps "OB left / right / long" for a hole and this turns the
// tag into an out-of-bounds UserZone along that side, starting past the fairway
// edge plus a margin, so the lie map, the ranking and the dots all see it.
// "Left" and "right" are as you face the green from the tee.

import { fromLocal, pointInRing, toLocal, type LatLng, type XY } from "./geo"
import type { Lie, LieMap, UserZone } from "./lies"
import type { CourseFeature } from "./overpass"
import {
  OB_BAND_DEPTH_YDS,
  OB_BAND_START_YDS,
  OB_DEFAULT_FAIRWAY_HALF_WIDTH_YDS,
  OB_LONG_PAST_GREEN_YDS,
  OB_MARGIN_MAX_YDS,
  OB_MARGIN_MIN_YDS,
  OB_MARGIN_YDS,
  OB_SCAN_HALF_WIDTH_YDS,
} from "./strategy"

export type ObSide = "left" | "right" | "long"
/** What the golfer said about a hole: OB on a side, or "none" (confirmed: no OB here). */
export type ObAnswer = ObSide | "none"

export interface ObTag {
  side: ObAnswer
  /** Yards from the fairway edge to the stakes. */
  marginYds: number
}

export const OB_ZONE_PREFIX = "ob-tag-"

export function clampMargin(m: number): number {
  return Number.isFinite(m) ? Math.min(OB_MARGIN_MAX_YDS, Math.max(OB_MARGIN_MIN_YDS, m)) : OB_MARGIN_YDS
}

const STEP_YDS = 10
const RAY_STEP_YDS = 2
const RAY_MAX_YDS = 80

interface Frame {
  pts: XY[]
  /** Unit heading at each point, local yards (x east, y north). */
  heading: XY[]
  /** Distance along the line at each point. */
  along: number[]
}

/** The line resampled every STEP_YDS, with the heading at each sample. */
function resample(line: XY[]): Frame {
  const pts: XY[] = []
  const heading: XY[] = []
  const along: number[] = []
  let cum = 0
  let next = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len === 0) continue
    const h = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    for (; next <= cum + len; next += STEP_YDS) {
      const t = next - cum
      pts.push({ x: a.x + h.x * t, y: a.y + h.y * t })
      heading.push(h)
      along.push(next)
    }
    cum += len
  }
  return { pts, heading, along }
}

/** Sign: +1 = right of the heading, -1 = left. Local axes: x east, y north, so right of (hx, hy) is (hy, -hx). */
function lateral(h: XY, side: 1 | -1): XY {
  return { x: h.y * side, y: -h.x * side }
}

export interface ObBand {
  zone: UserZone
  /** The edge where the stakes are (the band's inside), for drawing the red line. */
  edge: LatLng[]
}

/**
 * The OB band for one tag along a hole. `fairways` are the mapped fairway
 * polygons (for the edge); with none mapped the default half-width is used.
 */
export function obBand(side: ObSide, line: LatLng[], fairways: LatLng[][], marginYds: number): ObBand | null {
  if (line.length < 2) return null
  const origin = line[0]
  const local = line.map((p) => toLocal(origin, p))
  const rings = fairways.map((r) => r.map((p) => toLocal(origin, p)))
  const margin = clampMargin(marginYds)
  const insideFairway = (p: XY) => rings.some((r) => pointInRing(p.x, p.y, r))

  if (side === "long") {
    const end = local[local.length - 1]
    const prev = local[local.length - 2]
    const len = Math.hypot(end.x - prev.x, end.y - prev.y) || 1
    const h = { x: (end.x - prev.x) / len, y: (end.y - prev.y) / len }
    const r = lateral(h, 1)
    const start = OB_LONG_PAST_GREEN_YDS + margin
    const half = RAY_MAX_YDS
    const at = (along: number, across: number): XY => ({ x: end.x + h.x * along + r.x * across, y: end.y + h.y * along + r.y * across })
    const ring = [at(start, -half), at(start, half), at(start + OB_BAND_DEPTH_YDS, half), at(start + OB_BAND_DEPTH_YDS, -half)]
    return {
      zone: { id: `${OB_ZONE_PREFIX}long`, lie: "oob" as Lie, ring: ring.map((p) => fromLocal(origin, p)) },
      edge: [at(start, -half), at(start, half)].map((p) => fromLocal(origin, p)),
    }
  }

  const sign = side === "right" ? 1 : -1
  const f = resample(local)
  const inner: XY[] = []
  const outer: XY[] = []
  for (let i = 0; i < f.pts.length; i++) {
    if (f.along[i] < OB_BAND_START_YDS) continue
    const lat = lateral(f.heading[i], sign)
    // Fairway edge on this side: the farthest step out that is still inside a mapped fairway.
    let edge = 0
    for (let d = 0; d <= RAY_MAX_YDS; d += RAY_STEP_YDS) {
      if (insideFairway({ x: f.pts[i].x + lat.x * d, y: f.pts[i].y + lat.y * d })) edge = d
    }
    if (edge === 0) edge = OB_DEFAULT_FAIRWAY_HALF_WIDTH_YDS
    const near = edge + margin
    inner.push({ x: f.pts[i].x + lat.x * near, y: f.pts[i].y + lat.y * near })
    outer.push({ x: f.pts[i].x + lat.x * (near + OB_BAND_DEPTH_YDS), y: f.pts[i].y + lat.y * (near + OB_BAND_DEPTH_YDS) })
  }
  if (inner.length < 2) return null
  return {
    zone: { id: `${OB_ZONE_PREFIX}${side}`, lie: "oob" as Lie, ring: [...inner, ...outer.reverse()].map((p) => fromLocal(origin, p)) },
    edge: inner.map((p) => fromLocal(origin, p)),
  }
}

export function fairwayRings(features: CourseFeature[]): LatLng[][] {
  return features.filter((f) => f.kind === "fairway").map((f) => f.ring)
}

/** The OB bands for a hole's tags ("none" makes no band). */
export function obBandsFor(line: LatLng[], features: CourseFeature[], tags: ObTag[]): ObBand[] {
  const fairways = fairwayRings(features)
  return tags.flatMap((t) => (t.side === "none" ? [] : [obBand(t.side, line, fairways, t.marginYds)])).filter((b): b is ObBand => b != null)
}

export function obZonesFor(line: LatLng[], features: CourseFeature[], tags: ObTag[]): UserZone[] {
  return obBandsFor(line, features, tags).map((b) => b.zone)
}

/**
 * Whether any ground beside the hole's line counts as out of bounds on the map
 * (the course boundary, a road, buildings, or the golfer's own marks). Used to
 * decide whether to ask "Is there OB?": a hole with none within
 * OB_SCAN_HALF_WIDTH_YDS either side is the case the boundary check misses.
 */
export function hasOobBesideLine(line: LatLng[], lies: LieMap): boolean {
  if (line.length < 2) return true // nothing to scan: don't ask
  const origin = line[0]
  const f = resample(line.map((p) => toLocal(origin, p)))
  for (let i = 0; i < f.pts.length; i++) {
    for (const sign of [1, -1] as const) {
      const lat = lateral(f.heading[i], sign)
      for (let d = 10; d <= OB_SCAN_HALF_WIDTH_YDS; d += 10) {
        if (lies.lieAt(fromLocal(origin, { x: f.pts[i].x + lat.x * d, y: f.pts[i].y + lat.y * d })) === "oob") return true
      }
    }
  }
  return false
}
