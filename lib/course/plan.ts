// Club planning: given where the ball is, where the golfer is aiming and
// where the pin is, simulate what each club does and rank them by expected
// strokes. Shots fly along the aim line with the club's own carry and
// offline distribution, so a club that is too short or too long for the
// target simply lands in a worse place and scores worse -- no separate
// "does it reach" rule is needed.
//
// Two stages per shot: it lands at its carry (landing lie), rolls out
// (lib/course/roll.ts), and is scored where it STOPS (rest point and lie).

import { bearingDeg, distanceYds, landingPoint, type LatLng } from "./geo"
import { expectedFromStart, expectedStrokesRemaining, type StartLie } from "./cost"
import type { Lie, LieMap } from "./lies"
import { rollToRest, rollYds } from "./roll"
import { seededRng } from "@/lib/dispersion/stats"

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
  /** Carry plus roll: how far the average shot finishes along its line. */
  meanTotalYds: number
  /** The pattern's average finish point. */
  meanRest: LatLng
  lieShare: Record<Lie, number> // where the shots STOP, fractions summing to 1
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
  /** Where the shot stops, after rolling out. */
  point: LatLng
  lie: Lie
  /** Where it first came down. */
  carryPoint: LatLng
  carryLie: Lie
  /** Carry plus the roll it actually ran (less when a hazard stopped it). */
  totalYds: number
}

/**
 * Seed for the roll spread. Fixed, so a club scores the same every time --
 * and every aim bearing `bestAim` tries gets the same roll draws, so aims are
 * compared on their geometry, not on luck.
 */
export const ROLL_SEED = 11

export function simulateLandings(
  club: string,
  shots: ShotSample[],
  from: LatLng,
  aimBearing: number,
  lies: LieMap,
  rng: () => number = seededRng(ROLL_SEED)
): Landing[] {
  return shots.map((s) => {
    const carryPoint = landingPoint(from, aimBearing, s.carryYds, s.offlineYds)
    const carryLie = lies.lieAt(carryPoint)
    const roll = rollYds(club, carryLie, s.carryYds, rng)
    // It runs on in the direction it was travelling: from the golfer to where it came down.
    const rest = rollToRest(carryPoint, carryLie, bearingDeg(from, carryPoint), roll, lies)
    return { point: rest.point, lie: rest.lie, carryPoint, carryLie, totalYds: s.carryYds + rest.rolledYds }
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
  let total = 0
  let lat = 0
  let lng = 0
  landings.forEach((l, i) => {
    lieShare[l.lie] += 1
    strokes += 1 + expectedStrokesRemaining(l.lie, distanceYds(l.point, pin), origin)
    carry += shots[i].carryYds
    total += l.totalYds
    lat += l.point.lat
    lng += l.point.lng
  })
  const n = landings.length || 1
  for (const k of Object.keys(lieShare) as Lie[]) lieShare[k] /= n
  const expectedStrokes = strokes / n
  return {
    club,
    n: landings.length,
    meanCarryYds: carry / n,
    meanTotalYds: total / n,
    meanRest: landings.length ? { lat: lat / n, lng: lng / n } : from,
    lieShare,
    expectedStrokes,
    strokesGained: expectedFromStart(startLie, originDist) - expectedStrokes,
  }
}

export function evaluateClub(club: ClubShots, ctx: PlanContext, aimBearingOverride?: number): ClubPlan {
  const bearing = aimBearingOverride ?? bearingDeg(ctx.from, ctx.aim)
  const landings = simulateLandings(club.club, club.shots, ctx.from, bearing, ctx.lies)
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
 *
 * Only the BEARING from `ctx.from` matters for scoring (`evaluateClub` never
 * reads how far away `ctx.aim` is -- shots land wherever the club's own carry
 * distribution puts them, not at some nominal "aim distance"), so a 2D grid
 * over aim points would just re-test the same bearings from different,
 * scoring-irrelevant distances. The real bug this fixes: converting an
 * "off" (yards) into an angle needs a radius, and using `ctx.aim`'s distance
 * for that radius was wrong -- that distance is arbitrary UI state (wherever
 * the aim marker happens to be, e.g. still sitting near the pin while a much
 * shorter club is being evaluated), so the same +-30 yard search silently
 * covered a much smaller (or larger) real lateral range than 30 yards
 * whenever the marker's distance didn't match the club's own landing
 * distance -- easily missing an improvement a manual drag could stumble
 * onto. Using the club's own mean carry as the radius instead ties the
 * search's yard range to where its shots actually land.
 */
export function bestAim(club: ClubShots, ctx: PlanContext, maxOffsetYds = 60, stepYds = 2): AimResult {
  const { search, holdout } = splitShots(club.shots)
  const searchClub: ClubShots = { club: club.club, shots: search }
  const confirmClub: ClubShots = { club: club.club, shots: holdout.length > 0 ? holdout : search }

  const baseBearing = bearingDeg(ctx.from, ctx.aim)
  const meanCarryYds = club.shots.reduce((sum, s) => sum + s.carryYds, 0) / Math.max(club.shots.length, 1)
  const dist = Math.max(meanCarryYds, 10)
  let winner: { offsetYds: number; bearingDeg: number } | null = null
  let winnerStrokes = Infinity
  // Search outward from 0 (not left-to-right) so a tie -- e.g. everywhere past
  // some point is equally plain rough -- keeps the smallest, least-disruptive
  // offset instead of arbitrarily locking onto the search's farthest edge.
  const offsets: number[] = [0]
  for (let d = stepYds; d <= maxOffsetYds; d += stepYds) offsets.push(-d, d)
  for (const off of offsets) {
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
