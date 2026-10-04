// Small geometry helpers for the Play planner (moved verbatim from CourseMapClient.tsx).

import { distanceYds, lineLengthYds, pointAlongLine, ringCentroid, type LatLng } from "@/lib/course/geo"
import type { CourseFeature, CourseHole } from "@/lib/course/overpass"

export function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  return [[minLat, minLng], [maxLat, maxLng]]
}

/** Where the pin goes for a hole: the centre of the mapped green nearest its line's end (within 60 yd), else the line's end. */
export function holePinFor(h: CourseHole, features: CourseFeature[]): LatLng {
  const end = h.line[h.line.length - 1]
  let best: LatLng | null = null
  let bestD = 60
  for (const f of features) {
    if (f.kind !== "green") continue
    const c = ringCentroid(f.ring)
    const d = distanceYds(c, end)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best ?? end
}

/** A fairway, green or tee polygon counts as part of a hole when its centre is this close to the hole's line. Estimate: fairways are 30-50 yd wide, greens 15-25 yd across. */
const HOLE_FEATURE_REACH_YDS = 60
/** The line is checked every this many yards, so a long straight segment can't hide a nearby polygon. */
const LINE_SAMPLE_YDS = 25

/**
 * Every point the map should keep in view for a hole: its line, the pin, and
 * the fairway, green and tee polygons that belong to it (not a neighbouring
 * hole's fairway that happens to be close).
 */
export function holeFitPoints(h: CourseHole, features: CourseFeature[], pin: LatLng): LatLng[] {
  const samples: LatLng[] = []
  const total = lineLengthYds(h.line)
  for (let d = 0; d <= total; d += LINE_SAMPLE_YDS) samples.push(pointAlongLine(h.line, d))
  samples.push(h.line[h.line.length - 1])
  const pts: LatLng[] = [...h.line, pin]
  for (const f of features) {
    if (f.kind !== "fairway" && f.kind !== "green" && f.kind !== "tee") continue
    const c = ringCentroid(f.ring)
    if (samples.some((s) => distanceYds(s, c) <= HOLE_FEATURE_REACH_YDS)) pts.push(...f.ring)
  }
  return pts
}
