// Where a distance label sits on the map. A label belongs on its line, but the
// middle of the aim-to-pin line is often the green itself, so the label would
// hide the target. This slides it along the line, then to either side, until it
// clears the green polygon and the pin.

import { pointInRing, toLocal, type LatLng, type XY } from "@/lib/course/geo"

/** How far the label's centre stays from a green's edge or the pin, in screen pixels. Estimate: half a label's width plus a thumb's margin. */
export const LABEL_CLEARANCE_PX = 44
/** Positions tried along the line (0 = start, 1 = end), middle first. */
const ALONG = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]
/** Sideways steps tried at each position, in multiples of the clearance. */
const SIDE = [0, 1, -1, 2, -2]

export interface LabelAvoid {
  /** Green outlines (and anything else a label must not sit on). */
  rings: LatLng[][]
  /** Points to keep clear of, such as the pin. */
  points: LatLng[]
}

function segmentDist(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Yards from a point to a polygon: 0 inside it, else the distance to its nearest edge. */
export function distanceToRingYds(p: LatLng, ring: LatLng[]): number {
  if (ring.length === 0) return Infinity
  const xy = ring.map((q) => toLocal(p, q))
  if (pointInRing(0, 0, xy)) return 0
  let best = Infinity
  for (let i = 0; i < xy.length; i++) best = Math.min(best, segmentDist({ x: 0, y: 0 }, xy[i], xy[(i + 1) % xy.length]))
  return best
}

function clearance(p: LatLng, avoid: LabelAvoid): number {
  let d = Infinity
  for (const r of avoid.rings) d = Math.min(d, distanceToRingYds(p, r))
  for (const q of avoid.points) {
    const l = toLocal(p, q)
    d = Math.min(d, Math.hypot(l.x, l.y))
  }
  return d
}

/**
 * The label position for the line from `from` to `to`. `yardsPerPx` converts the
 * clearance to yards at the current zoom, so the label keeps the same on-screen
 * gap from the green however far the golfer is zoomed in.
 */
export function placeLabel(from: LatLng, to: LatLng, avoid: LabelAvoid, yardsPerPx: number): LatLng {
  const need = LABEL_CLEARANCE_PX * yardsPerPx
  const lineXY = toLocal(from, to)
  const len = Math.hypot(lineXY.x, lineXY.y) || 1
  // unit vector perpendicular to the line, as a lat/lng step per yard
  const nx = -lineXY.y / len
  const ny = lineXY.x / len
  let best: LatLng = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }
  let bestClear = -1
  // Nearest to the line first: slide along it, then step off it a little more each time.
  for (const s of SIDE) {
    for (const t of ALONG) {
      const base = { x: lineXY.x * t + nx * s * need, y: lineXY.y * t + ny * s * need }
      const cand = fromOffset(from, base)
      const c = clearance(cand, avoid)
      if (c >= need) return cand
      if (c > bestClear) {
        bestClear = c
        best = cand
      }
    }
  }
  return best
}

function fromOffset(origin: LatLng, o: XY): LatLng {
  const probe = toLocal(origin, { lat: origin.lat + 1e-5, lng: origin.lng + 1e-5 })
  return { lat: origin.lat + (o.y / probe.y) * 1e-5, lng: origin.lng + (o.x / probe.x) * 1e-5 }
}
