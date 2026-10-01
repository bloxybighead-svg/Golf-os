// Two map overlays for the planner:
//  - a "trouble map": every spot around the hole coloured by how many strokes
//    a ball costs you there compared with lying in the fairway at the same
//    distance (green cells are better than the fairway, red are worse)
//  - dispersion rings: where 50% and 90% of a club's shots land
// Pure geometry so it can be tested without a browser.

import type { StartLie } from "./cost"
import { TOUR_BASELINE, type Baseline } from "./baseline"
import { distanceYds, fromLocal, toLocal, type LatLng } from "./geo"
import type { LieMap } from "./lies"

export interface ValueCell {
  sw: LatLng
  ne: LatLng
  /** strokes vs a fairway lie at the same distance: negative = better, positive = worse */
  delta: number
}

const MAX_CELLS = 1600
const MARGIN_YDS = 60

/**
 * Sample the area around the ball, aim and pin on a square grid. The cell size
 * grows on long holes so the grid never exceeds MAX_CELLS.
 */
export function buildValueGrid(
  points: LatLng[],
  pin: LatLng,
  from: LatLng,
  startLie: StartLie,
  lies: LieMap,
  baseline: Baseline = TOUR_BASELINE
): ValueCell[] {
  if (points.length === 0) return []
  const origin = points[0]
  const local = points.map((p) => toLocal(origin, p))
  const minX = Math.min(...local.map((p) => p.x)) - MARGIN_YDS
  const maxX = Math.max(...local.map((p) => p.x)) + MARGIN_YDS
  const minY = Math.min(...local.map((p) => p.y)) - MARGIN_YDS
  const maxY = Math.max(...local.map((p) => p.y)) + MARGIN_YDS
  const area = (maxX - minX) * (maxY - minY)
  const cell = Math.max(6, Math.sqrt(area / MAX_CELLS))
  const origin2 = { distYds: distanceYds(from, pin), lie: startLie }
  const out: ValueCell[] = []
  for (let x = minX; x < maxX; x += cell) {
    for (let y = minY; y < maxY; y += cell) {
      const centre = fromLocal(origin, { x: x + cell / 2, y: y + cell / 2 })
      const d = distanceYds(centre, pin)
      const lie = lies.lieAt(centre)
      const e = baseline.expectedStrokesRemaining(lie, d, origin2)
      out.push({
        sw: fromLocal(origin, { x, y }),
        ne: fromLocal(origin, { x: x + cell, y: y + cell }),
        delta: e - baseline.fairway(d),
      })
    }
  }
  return out
}

/**
 * Diverging colour for a value cell: green (better than fairway) through clear
 * to red (much worse). `color` is a token name from app/globals.css.
 */
export function deltaColor(delta: number): { color: string; opacity: number } {
  if (delta < -0.05) {
    const t = Math.min(1, -delta / 0.8)
    return { color: "map-better", opacity: 0.12 + 0.3 * t }
  }
  if (delta < 0.1) return { color: "map-marker", opacity: 0 }
  const t = Math.min(1, delta / 1.2)
  // amber -> red as trouble gets costlier
  return { color: t < 0.5 ? "map-caution" : "map-worse", opacity: 0.14 + 0.3 * t }
}

/**
 * Ellipse (as lat/lng points) covering a fraction of a bivariate-normal cloud.
 * `k` is the Mahalanobis radius: 1.177 covers 50% of shots, 2.146 covers 90%.
 */
export function dispersionRing(points: LatLng[], k: number, steps = 48): LatLng[] {
  const n = points.length
  if (n < 5) return []
  const origin = points[0]
  const xy = points.map((p) => toLocal(origin, p))
  const mx = xy.reduce((a, p) => a + p.x, 0) / n
  const my = xy.reduce((a, p) => a + p.y, 0) / n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of xy) {
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  sxx /= n - 1
  syy /= n - 1
  sxy /= n - 1
  // eigen-decomposition of [[sxx, sxy], [sxy, syy]]
  const tr = sxx + syy
  const det = sxx * syy - sxy * sxy
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = Math.max(tr / 2 - disc, 0)
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const a = k * Math.sqrt(l1)
  const b = k * Math.sqrt(l2)
  const ring: LatLng[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const ex = a * Math.cos(t)
    const ey = b * Math.sin(t)
    ring.push(fromLocal(origin, { x: mx + ex * Math.cos(theta) - ey * Math.sin(theta), y: my + ex * Math.sin(theta) + ey * Math.cos(theta) }))
  }
  return ring
}
