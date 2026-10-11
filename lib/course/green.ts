// Yardages to the front, center and back of a green, measured along the line from the ball to the pin.

import { distanceYds, pointInRing, ringCentroid, toLocal, type LatLng } from "./geo"
import type { UserZone } from "./lies"
import type { CourseFeature, CourseHole } from "./overpass"

/** A green polygon counts as a hole's when its centre is this close to the end of the hole's line, yards. */
const GREEN_NEAR_END_YDS = 60

export interface GreenYardages {
  front: number
  center: number
  back: number
}

/**
 * The hole's green: the last green the golfer drew near the end of the hole's line, else the mapped green nearest
 * it (both within GREEN_NEAR_END_YDS), or null when there is none.
 */
export function holeGreen(hole: CourseHole, features: CourseFeature[], zones: UserZone[] = []): LatLng[] | null {
  const end = hole.line[hole.line.length - 1]
  const drawn = zones.filter((z) => z.lie === "green" && distanceYds(ringCentroid(z.ring), end) < GREEN_NEAR_END_YDS)
  if (drawn.length > 0) return drawn[drawn.length - 1].ring
  let best: LatLng[] | null = null
  let bestD = GREEN_NEAR_END_YDS
  for (const f of features) {
    if (f.kind !== "green") continue
    const d = distanceYds(ringCentroid(f.ring), end)
    if (d < bestD) {
      bestD = d
      best = f.ring
    }
  }
  return best
}

/**
 * Yards from the ball to where the line to the pin enters (front) and leaves (back) the green; center is the
 * pin, or the green's centroid when no pin is set. A ball already on the green has front 0. Null when there is
 * no green, or the line never touches it.
 */
export function greenYardages(ball: LatLng, pin: LatLng | null, green: LatLng[] | null): GreenYardages | null {
  if (!green || green.length < 3) return null
  const target = pin ?? ringCentroid(green)
  const center = distanceYds(ball, target)
  if (center === 0) return null
  const d = toLocal(ball, target)
  const ring = green.map((p) => toLocal(ball, p))

  // Where the ray from the ball through the target crosses each edge, as a share of the distance to the target.
  let enter = Infinity
  let leave = -Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const e = { x: ring[i].x - ring[j].x, y: ring[i].y - ring[j].y }
    const denom = d.x * e.y - d.y * e.x
    if (denom === 0) continue // parallel
    const t = (ring[j].x * e.y - ring[j].y * e.x) / denom
    const s = (ring[j].x * d.y - ring[j].y * d.x) / denom
    if (t < 0 || s < 0 || s > 1) continue
    enter = Math.min(enter, t)
    leave = Math.max(leave, t)
  }
  if (leave === -Infinity) return null
  if (pointInRing(0, 0, ring)) enter = 0
  return { front: enter * center, center, back: leave * center }
}
