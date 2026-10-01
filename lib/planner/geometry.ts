// Small geometry helpers for the Play planner (moved verbatim from CourseMapClient.tsx).

import { distanceYds, ringCentroid, type LatLng } from "@/lib/course/geo"
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
