// Club planning: given where the ball is, where the golfer is aiming and
// where the pin is, simulate what each club does and rank them by expected
// strokes. Shots fly along the aim line with the club's own carry and
// offline distribution, so a club that is too short or too long for the
// target simply lands in a worse place and scores worse -- no separate
// "does it reach" rule is needed.

import { bearingDeg, distanceYds, landingPoint, type LatLng } from "./geo"
import { expectedFromStart, expectedStrokesRemaining, type StartLie } from "./cost"
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
  /**
   * Strokes gained per shot against the PGA TOUR baseline:
   * E(strokes from where you stand) - expectedStrokes. Positive = better than
   * a tour player's average shot from the same spot.
   */
  strokesGained: number
}

export interface PlanContext {
  from: LatLng
  aim: LatLng
  pin: LatLng
  lies: LieMap
  /** Where the ball is lying now (defaults to fairway); the tee uses the tour tee-shot column. */
  startLie?: StartLie
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

function scoreLandings(
  club: string,
  shots: ShotSample[],
  landings: Landing[],
  from: LatLng,
  pin: LatLng,
  startLie: StartLie
): ClubPlan {
  const lieShare: Record<Lie, number> = { water: 0, oob: 0, bunker: 0, green: 0, fairway: 0, trees: 0, rough: 0 }
  const originDist = distanceYds(from, pin)
  const origin = { distYds: originDist, lie: startLie }
  let strokes = 0
  let carry = 0
  landings.forEach((l, i) => {
    lieShare[l.lie] += 1
    strokes += 1 + expectedStrokesRemaining(l.lie, distanceYds(l.point, pin), origin)
    carry += shots[i].carryYds
  })
  const n = landings.length || 1
  for (const k of Object.keys(lieShare) as Lie[]) lieShare[k] /= n
  const expectedStrokes = strokes / n
  return {
    club,
    n: landings.length,
    meanCarryYds: carry / n,
    lieShare,
    expectedStrokes,
    strokesGained: expectedFromStart(startLie, originDist) - expectedStrokes,
  }
}

export function evaluateClub(club: ClubShots, ctx: PlanContext, aimBearingOverride?: number): ClubPlan {
  const bearing = aimBearingOverride ?? bearingDeg(ctx.from, ctx.aim)
  const landings = simulateLandings(club.shots, ctx.from, bearing, ctx.lies)
  return scoreLandings(club.club, club.shots, landings, ctx.from, ctx.pin, ctx.startLie ?? "fairway")
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

/** Deterministic disjoint split (even/odd index) -- no shuffle needed since the
 * shots array is already in an arbitrary (seeded-random) order upstream. */
function splitShots(shots: ShotSample[]): { search: ShotSample[]; holdout: ShotSample[] } {
  const search: ShotSample[] = []
  const holdout: ShotSample[] = []
  shots.forEach((s, i) => (i % 2 === 0 ? search : holdout).push(s))
  return { search, holdout }
}

/**
 * Shift the aim left/right in 2-yard steps and keep the best candidate --
 * found using only HALF the club's shots. The winner (and the original aim,
 * for comparison) are then re-scored on the other half, which the search
 * never touched. Grading a search's own winner on the data that picked it is
 * optimistic (the "winner's curse" -- see STATISTICAL_ANALYSIS.md and
 * aim_point_optimizer.py's paired-resample fix, same idea); a held-out half
 * removes that without needing fresh real-world data, which isn't available
 * for a calibrated golfer's fixed shot history.
 */
export function bestAim(club: ClubShots, ctx: PlanContext, maxOffsetYds = 30, stepYds = 2): AimResult {
  const { search, holdout } = splitShots(club.shots)
  const searchClub: ClubShots = { club: club.club, shots: search }
  const confirmClub: ClubShots = { club: club.club, shots: holdout.length > 0 ? holdout : search }

  const baseBearing = bearingDeg(ctx.from, ctx.aim)
  const dist = Math.max(distanceYds(ctx.from, ctx.aim), 10)
  let winner: { offsetYds: number; bearingDeg: number } | null = null
  let winnerStrokes = Infinity
  for (let off = -maxOffsetYds; off <= maxOffsetYds; off += stepYds) {
    const bearing = (baseBearing + (Math.atan2(off, dist) * 180) / Math.PI + 360) % 360
    const strokes = evaluateClub(searchClub, ctx, bearing).expectedStrokes
    if (strokes < winnerStrokes) {
      winnerStrokes = strokes
      winner = { offsetYds: off, bearingDeg: bearing }
    }
  }
  const w = winner as { offsetYds: number; bearingDeg: number }
  return {
    offsetYds: w.offsetYds,
    bearingDeg: w.bearingDeg,
    plan: evaluateClub(confirmClub, ctx, w.bearingDeg),
    baselineStrokes: evaluateClub(confirmClub, ctx, baseBearing).expectedStrokes,
  }
}
