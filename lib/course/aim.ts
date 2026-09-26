// Default aim point for the start of a hole: the middle of the fairway, along
// the hole's centerline. Pure geometry so it can be tested without a map.

import { distanceYds, lineLengthYds, pointAlongLine, toLocal, type LatLng } from "./geo"
import type { CourseFeature } from "./overpass"

const FAIRWAY_NEAR_LINE_YDS = 25 // a fairway "belongs" to a hole if a vertex is this close to its centerline
const FAIRWAY_VERTEX_YDS = 45 // ...and only vertices this close count toward its length
const MIN_AIM_YDS = 60

/** Where p falls along a polyline (yards from its start) and how far off the line it is. */
export function projectOnLine(line: LatLng[], p: LatLng): { along: number; off: number } {
  let bestOff = Infinity
  let bestAlong = 0
  let cum = 0
  for (let i = 1; i < line.length; i++) {
    const a = toLocal(p, line[i - 1])
    const b = toLocal(p, line[i])
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const seg = Math.sqrt(len2)
    // p is the origin here, so the projection parameter simplifies:
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-a.x * dx - a.y * dy) / len2))
    const off = Math.hypot(a.x + t * dx, a.y + t * dy)
    if (off < bestOff) {
      bestOff = off
      bestAlong = cum + t * seg
    }
    cum += seg
  }
  return { along: bestAlong, off: bestOff }
}

/** Distance along the hole where the fairway starts and ends, or null if none is mapped for it. */
export function fairwayExtent(line: LatLng[], features: CourseFeature[]): { start: number; end: number } | null {
  let start = Infinity
  let end = -Infinity
  for (const f of features) {
    if (f.kind !== "fairway") continue
    const proj = f.ring.map((v) => projectOnLine(line, v))
    if (!proj.some((q) => q.off < FAIRWAY_NEAR_LINE_YDS)) continue
    for (const q of proj) {
      if (q.off > FAIRWAY_VERTEX_YDS) continue
      start = Math.min(start, q.along)
      end = Math.max(end, q.along)
    }
  }
  return start < end ? { start, end } : null
}

/**
 * Aim for the first shot of a hole. Par 3s and holes with no fairway mapped
 * near the line aim at the pin (or, if the hole is longer than the golfer's
 * longest club, as far along the line as that club reaches). Otherwise the
 * aim is the middle of the mapped fairway, held to the longest carry.
 */
export function defaultTeeAim(line: LatLng[], pin: LatLng, features: CourseFeature[], longestCarryYds: number): LatLng {
  const length = lineLengthYds(line)
  const ext = fairwayExtent(line, features)
  if (ext && length > 200) {
    const mid = (ext.start + ext.end) / 2
    // No point aiming past where the driver can go, or short of the tee.
    const aimAlong = Math.max(MIN_AIM_YDS, Math.min(mid, longestCarryYds))
    // If the fairway middle is essentially at the green, just aim at the pin.
    return length - aimAlong < 30 ? pin : pointAlongLine(line, aimAlong)
  }
  if (length > longestCarryYds + 40) return pointAlongLine(line, longestCarryYds)
  return distanceYds(line[0], pin) > 0 ? pin : line[line.length - 1]
}
