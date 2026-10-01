// Club planning: given where the ball is, where the golfer is aiming and
// where the pin is, simulate what each club does and rank them by expected
// strokes. Shots fly along the aim line with the club's own carry and
// offline distribution, so a club that is too short or too long for the
// target simply lands in a worse place and scores worse -- no separate
// "does it reach" rule is needed.
//
// Two stages per shot: it lands at its carry (landing lie), rolls out
// (lib/course/roll.ts), and is scored where it STOPS (rest point and lie).
// A shot that stops in water is played again from where it crossed into the
// water (waterEntryPoint), not from where it splashed down.

import { bearingDeg, distanceYds, landingPoint, lineLengthYds, pointAlongLine, type LatLng } from "./geo"
import { projectOnLine } from "./aim"
import type { StartLie } from "./cost"
import { TOUR_BASELINE, type Baseline } from "./baseline"
import type { Lie, LieMap, LieSource } from "./lies"
import { rollToRest, rollYds } from "./roll"
import { seededRng, seededSample } from "@/lib/dispersion/stats"

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
  /** Share of shots that stop on unmapped ground, whose lie is a guess by distance (see lies.ts). */
  unmappedShare: number
  expectedStrokes: number // this shot + expected strokes remaining afterwards
  /**
   * Standard error of expectedStrokes: the spread of the per-shot values
   * divided by sqrt(n). How much the average would move with a different
   * sample of the same golfer's shots.
   */
  strokesSe: number
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
  /** What strokes to hole out are measured against (baseline.ts): a handicap, or the PGA TOUR (default). */
  baseline?: Baseline
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
  /** Whether the lie where it stops is mapped or guessed. */
  lieSource: LieSource
  /** For a shot that stops in water: where it last crossed into the water (the drop). Null if not found. */
  dropPoint: LatLng | null
}

/**
 * Above this share of a club's shots stopping on unmapped ground, the planner
 * says so and asks the golfer to draw what's there. A judgement call: about
 * one shot in five is enough guesswork to change a club or aim decision.
 */
export const UNMAPPED_NOTE_SHARE = 0.2

/** True when enough of a club's pattern rests on guessed ground to warn about it. */
export function flagsUnmapped(plan: Pick<ClubPlan, "unmappedShare">): boolean {
  return plan.unmappedShare > UNMAPPED_NOTE_SHARE
}

/** Step size, yards, when walking back along a shot to find where it went into the water. */
const WATER_ENTRY_STEP_YDS = 5
/** Halvings after that step brackets the water's edge: 5 yd / 2^4 = about a third of a yard. */
const WATER_ENTRY_BISECTIONS = 4

/**
 * Where a shot that stopped in water last crossed into it: walking back
 * along its path (the golfer -> where it landed -> where it stopped), the
 * first spot that isn't water. That's the reference point for the drop.
 * Null when the whole path back to the golfer is water (nothing to drop at).
 */
export function waterEntryPoint(from: LatLng, carryPoint: LatLng, rest: LatLng, lies: LieMap): LatLng | null {
  const flight = distanceYds(from, carryPoint)
  const rolled = distanceYds(carryPoint, rest)
  const total = flight + rolled
  const flightBearing = bearingDeg(from, carryPoint)
  const rollBearing = rolled > 0 ? bearingDeg(carryPoint, rest) : flightBearing
  // Distance s along the path -> point.
  const at = (s: number) => (s <= flight ? landingPoint(from, flightBearing, s, 0) : landingPoint(carryPoint, rollBearing, s - flight, 0))
  const wet = (s: number) => lies.lieAt(at(s)) === "water"

  let wetS = total
  let dryS = total - WATER_ENTRY_STEP_YDS
  while (dryS > 0 && wet(dryS)) {
    wetS = dryS
    dryS -= WATER_ENTRY_STEP_YDS
  }
  if (dryS <= 0) {
    if (wet(0)) return null
    dryS = 0
  }
  for (let i = 0; i < WATER_ENTRY_BISECTIONS; i++) {
    const mid = (dryS + wetS) / 2
    if (wet(mid)) wetS = mid
    else dryS = mid
  }
  return at(dryS)
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
    const carry = lies.classify(carryPoint)
    const roll = rollYds(club, carry.lie, s.carryYds, rng)
    // It runs on in the direction it was travelling: from the golfer to where it came down.
    const rest = rollToRest(carryPoint, carry.lie, bearingDeg(from, carryPoint), roll, lies)
    const lieSource = rest.rolledYds > 0 ? lies.classify(rest.point).source : carry.source
    return {
      point: rest.point,
      lie: rest.lie,
      carryPoint,
      carryLie: carry.lie,
      totalYds: s.carryYds + rest.rolledYds,
      lieSource,
      dropPoint: rest.lie === "water" ? waterEntryPoint(from, carryPoint, rest.point, lies) : null,
    }
  })
}

function scoreLandings(
  club: string,
  shots: ShotSample[],
  landings: Landing[],
  from: LatLng,
  pin: LatLng,
  startLie: StartLie,
  baseline: Baseline
): ClubPlan {
  const lieShare: Record<Lie, number> = { water: 0, oob: 0, bunker: 0, green: 0, fairway: 0, trees: 0, rough: 0 }
  const originDist = distanceYds(from, pin)
  const origin = { distYds: originDist, lie: startLie }
  let strokes = 0
  let carry = 0
  let total = 0
  let lat = 0
  let lng = 0
  let inferred = 0
  const perShot: number[] = []
  landings.forEach((l, i) => {
    lieShare[l.lie] += 1
    if (l.lieSource === "inferred") inferred += 1
    const dropDist = l.dropPoint ? distanceYds(l.dropPoint, pin) : undefined
    const shot = 1 + baseline.expectedStrokesRemaining(l.lie, distanceYds(l.point, pin), origin, dropDist)
    strokes += shot
    perShot.push(shot)
    carry += shots[i].carryYds
    total += l.totalYds
    lat += l.point.lat
    lng += l.point.lng
  })
  const n = landings.length || 1
  for (const k of Object.keys(lieShare) as Lie[]) lieShare[k] /= n
  const expectedStrokes = strokes / n
  const m = landings.length
  // Sample variance, two passes (the one-pass sum-of-squares formula loses precision).
  const variance = m > 1 ? perShot.reduce((a, v) => a + (v - expectedStrokes) ** 2, 0) / (m - 1) : 0
  return {
    club,
    n: landings.length,
    meanCarryYds: carry / n,
    meanTotalYds: total / n,
    meanRest: landings.length ? { lat: lat / n, lng: lng / n } : from,
    lieShare,
    unmappedShare: inferred / n,
    expectedStrokes,
    strokesSe: m > 0 ? Math.sqrt(variance / m) : 0,
    strokesGained: baseline.expectedFromStart(startLie, originDist) - expectedStrokes,
  }
}

export function evaluateClub(club: ClubShots, ctx: PlanContext, aimBearingOverride?: number): ClubPlan {
  const bearing = aimBearingOverride ?? bearingDeg(ctx.from, ctx.aim)
  const landings = simulateLandings(club.club, club.shots, ctx.from, bearing, ctx.lies)
  return scoreLandings(club.club, club.shots, landings, ctx.from, ctx.pin, ctx.startLie ?? "fairway", ctx.baseline ?? TOUR_BASELINE)
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
export function splitShots(shots: ShotSample[]): { search: ShotSample[]; holdout: ShotSample[] } {
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

// ---- Ranking every club at its own best aim --------------------------------
// rankClubs scores every club along ONE bearing (the aim marker), which is
// unfair: a driver's aim at the corner of a dogleg sends a 7-iron through
// the rough. rankClubsOptimized gives each club its own aim search, centred
// on the hole's centreline at that club's distance, and ranks clubs by the
// held-out strokes at their own best bearing.

/**
 * Shots per club the ranking uses (half to search, half held out). A speed
 * setting: ranking the whole bag at 1,000 shots a club took ~1.3 s on a
 * desktop, too slow for a phone. 400 keeps the held-out half at 200 shots,
 * enough for a standard error of about 0.03 strokes; the tie rule accounts
 * for it. The dots and the card still use every shot.
 */
export const RANKING_SHOT_CAP = 400

/** Seed for picking which RANKING_SHOT_CAP shots are used, so the ranking repeats. */
export const RANKING_SAMPLE_SEED = 5

/**
 * Two clubs count as a tie when their gap is within this many standard
 * errors of the difference, sqrt(SEa^2 + SEb^2): the clubs' shots are
 * separate samples, so that is how much the gap itself could move by chance.
 * 1 SE is the spec's choice (lenient: a real gap of 1 SE is still called a
 * tie about a third of the time).
 */
export const TIE_SE_MULTIPLIER = 1

/**
 * If the ball is farther than this from the hole's centreline, the line
 * isn't a sensible reference (the ball is on another hole, or placed by
 * hand somewhere odd) and the search centres on the aim instead. A judgement
 * call: wider than any fairway plus its rough.
 */
export const CENTERLINE_MAX_OFF_YDS = 100

/** Step along the centreline when looking for the point a club reaches, yards. */
const CENTERLINE_STEP_YDS = 2

export interface OptimizedClubPlan {
  club: string
  /** Best bearing found for this club (degrees from north). */
  bearingDeg: number
  /** Where that bearing points, relative to the search centre (the centreline at the club's distance): right positive, yards at the club's carry. */
  offsetYds: number
  /** Held-out plan at the best bearing: expected strokes, SE, lie shares, carry/total. */
  plan: ClubPlan
  /** The same held-out shots, aimed at the aim marker instead, for comparison. */
  atAimStrokes: number
}

export interface RankOptions {
  /** The hole's centreline (tee to green). Without it each club's search centres on ctx.aim. */
  line?: LatLng[] | null
  maxOffsetYds?: number
  stepYds?: number
  shotCap?: number
}

/**
 * The point on the hole's centreline, ahead of the ball, `distYds` from it.
 * If the club goes past the end of the line, the pin (or the line's end).
 * Null when there's no line or the ball is far off it.
 */
export function centerlineAim(line: LatLng[] | null | undefined, from: LatLng, distYds: number, pin?: LatLng): LatLng | null {
  if (!line || line.length < 2) return null
  const start = projectOnLine(line, from)
  if (start.off > CENTERLINE_MAX_OFF_YDS) return null
  const length = lineLengthYds(line)
  for (let s = start.along; s <= length; s += CENTERLINE_STEP_YDS) {
    const p = pointAlongLine(line, s)
    if (distanceYds(from, p) >= distYds) return p
  }
  return pin ?? line[line.length - 1]
}

/** The shots the ranking uses for a club: all of them, or a fixed-seed sample of RANKING_SHOT_CAP. */
export function rankingShots(club: ClubShots, cap = RANKING_SHOT_CAP): ClubShots {
  return club.shots.length > cap ? { club: club.club, shots: seededSample(club.shots, cap, RANKING_SAMPLE_SEED) } : club
}

/** Expected strokes at the aim marker on the held-out half of the ranking shots: the "at your aim" number. */
export function strokesAtAim(club: ClubShots, ctx: PlanContext, cap = RANKING_SHOT_CAP): number {
  const { search, holdout } = splitShots(rankingShots(club, cap).shots)
  return evaluateClub({ club: club.club, shots: holdout.length > 0 ? holdout : search }, ctx).expectedStrokes
}

/** Every club at its own best aim, best (lowest held-out expected strokes) first. */
export function rankClubsOptimized(clubs: ClubShots[], ctx: PlanContext, opts: RankOptions = {}): OptimizedClubPlan[] {
  const cap = opts.shotCap ?? RANKING_SHOT_CAP
  return clubs
    .filter((c) => c.shots.length > 0)
    .map((c) => {
      const shots = rankingShots(c, cap)
      // How far this club goes (carry + roll) decides where on the centreline its search is centred.
      const reach = evaluateClub(shots, ctx).meanTotalYds
      const centre = centerlineAim(opts.line, ctx.from, reach, ctx.pin) ?? ctx.aim
      const r = bestAim(shots, { ...ctx, aim: centre }, opts.maxOffsetYds ?? 60, opts.stepYds ?? 2)
      return {
        club: c.club,
        bearingDeg: r.bearingDeg,
        offsetYds: r.offsetYds,
        plan: r.plan,
        atAimStrokes: strokesAtAim(c, ctx, cap),
      }
    })
    .sort((a, b) => a.plan.expectedStrokes - b.plan.expectedStrokes)
}

/** True when `club` is within TIE_SE_MULTIPLIER standard errors of `best` (and isn't the best itself). */
export function isTie(club: Pick<ClubPlan, "expectedStrokes" | "strokesSe">, best: Pick<ClubPlan, "expectedStrokes" | "strokesSe">): boolean {
  if (club === best) return false
  const gap = club.expectedStrokes - best.expectedStrokes
  return gap <= TIE_SE_MULTIPLIER * Math.hypot(club.strokesSe, best.strokesSe)
}

/** The table's Aim column: "6 L", "12 R", or "center". */
export function aimOffsetLabel(offsetYds: number): string {
  const yds = Math.round(Math.abs(offsetYds))
  if (yds === 0) return "center"
  return `${yds} ${offsetYds < 0 ? "L" : "R"}`
}

/**
 * Where to put the aim marker for a club's best aim: along its best bearing,
 * at its average finish or the pin's distance, whichever is shorter (so an
 * approach that reaches the green aims at the pin itself).
 */
export function aimMarkerFor(from: LatLng, pin: LatLng, r: Pick<OptimizedClubPlan, "bearingDeg" | "plan">): LatLng {
  const toPin = distanceYds(from, pin)
  if (Math.abs(angleDiffDeg(bearingDeg(from, pin), r.bearingDeg)) < BEARING_MATCH_DEG && r.plan.meanTotalYds >= toPin) return pin
  return landingPoint(from, r.bearingDeg, Math.min(r.plan.meanTotalYds, toPin), 0)
}

/** Bearings closer than this count as the same aim (well under a yard at 300 yd). */
const BEARING_MATCH_DEG = 0.1

function angleDiffDeg(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180
}

/** True when the aim marker already points along the club's best bearing (only the bearing is scored). */
export function isAtBestAim(from: LatLng, aim: LatLng, r: Pick<OptimizedClubPlan, "bearingDeg">): boolean {
  return Math.abs(angleDiffDeg(bearingDeg(from, aim), r.bearingDeg)) < BEARING_MATCH_DEG
}
