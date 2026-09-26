// Club planning: given where the ball is, where the golfer is aiming and
// where the pin is, simulate what each club does and rank them by expected
// strokes. Shots fly along the aim line with the club's own carry and
// offline distribution, so a club that is too short or too long for the
// target simply lands in a worse place and scores worse -- no separate
// "does it reach" rule is needed.

import { bearingDeg, distanceYds, landingPoint, type LatLng } from "./geo"
import { expectedStrokesRemaining } from "./cost"
import type { Lie, LieMap } from "./lies"

export interface ShotSample {
  carryYds: number
  offlineYds: number
}

export interface ClubShots {
  club: string
  shots: ShotSample[]
}

export interface ClubPlan {
  club: string
  n: number
  meanCarryYds: number
  lieShare: Record<Lie, number> // fractions summing to 1
  expectedStrokes: number // this shot + expected strokes remaining afterwards
}

export interface PlanContext {
  from: LatLng
  aim: LatLng
  pin: LatLng
  lies: LieMap
}

export interface Landing {
  point: LatLng
  lie: Lie
}

export function simulateLandings(shots: ShotSample[], from: LatLng, aimBearing: number, lies: LieMap): Landing[] {
  return shots.map((s) => {
    const point = landingPoint(from, aimBearing, s.carryYds, s.offlineYds)
    return { point, lie: lies.lieAt(point) }
  })
}

function scoreLandings(club: string, shots: ShotSample[], landings: Landing[], pin: LatLng): ClubPlan {
  const lieShare: Record<Lie, number> = { water: 0, bunker: 0, green: 0, fairway: 0, rough: 0 }
  let strokes = 0
  let carry = 0
  landings.forEach((l, i) => {
    lieShare[l.lie] += 1
    strokes += 1 + expectedStrokesRemaining(l.lie, distanceYds(l.point, pin))
    carry += shots[i].carryYds
  })
  const n = landings.length || 1
  for (const k of Object.keys(lieShare) as Lie[]) lieShare[k] /= n
  return { club, n: landings.length, meanCarryYds: carry / n, lieShare, expectedStrokes: strokes / n }
}

export function evaluateClub(club: ClubShots, ctx: PlanContext, aimBearingOverride?: number): ClubPlan {
  const bearing = aimBearingOverride ?? bearingDeg(ctx.from, ctx.aim)
  const landings = simulateLandings(club.shots, ctx.from, bearing, ctx.lies)
  return scoreLandings(club.club, club.shots, landings, ctx.pin)
}

/** Every club, best (lowest expected strokes) first. */
export function rankClubs(clubs: ClubShots[], ctx: PlanContext): ClubPlan[] {
  return clubs
    .filter((c) => c.shots.length > 0)
    .map((c) => evaluateClub(c, ctx))
    .sort((a, b) => a.expectedStrokes - b.expectedStrokes)
}

export interface AimResult {
  offsetYds: number // lateral shift of the aim, at the target's distance; right positive
  bearingDeg: number
  plan: ClubPlan
  baselineStrokes: number // same club, aimed at the original aim point
}

/**
 * Shift the aim left/right in 2-yard steps and keep the best. Same shots
 * are reused for every candidate, so the winner's saving is slightly
 * optimistic (see STATISTICAL_ANALYSIS.md, "winner's curse"); treat small
 * differences as noise.
 */
export function bestAim(club: ClubShots, ctx: PlanContext, maxOffsetYds = 30, stepYds = 2): AimResult {
  const baseBearing = bearingDeg(ctx.from, ctx.aim)
  const dist = Math.max(distanceYds(ctx.from, ctx.aim), 10)
  const baseline = evaluateClub(club, ctx, baseBearing).expectedStrokes
  let best: AimResult | null = null
  for (let off = -maxOffsetYds; off <= maxOffsetYds; off += stepYds) {
    const bearing = (baseBearing + (Math.atan2(off, dist) * 180) / Math.PI + 360) % 360
    const plan = evaluateClub(club, ctx, bearing)
    if (!best || plan.expectedStrokes < best.plan.expectedStrokes) {
      best = { offsetYds: off, bearingDeg: bearing, plan, baselineStrokes: baseline }
    }
  }
  return best as AimResult
}
