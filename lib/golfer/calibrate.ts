// Ported from shot-pattern-simulator/calibrate.py (calibrate()). Keep this in
// sync with that file -- it's the source of truth and its comments carry the
// reasoning. The parity test (calibrate.test.ts) runs this against a JSON
// that calibrate.py wrote from the same shots.
//
// Two additions over the Python, both inert when every shot has weight 1:
//   - per-shot weights (recency, surface), see shotProfile.ts
//   - the caller decides which shots are partials; they never reach this file.
//
// Statistics use the SAMPLE standard deviation (n - 1), like pandas' .std(),
// except distance_cv, which calibrate.py takes with numpy's population .std().
// With weights it is the unbiased "reliability weights" estimator, which is
// the same thing when the weights are all equal.

import { canonicalClub } from "./bag"
import { CLUB_CURVE_SHARE } from "./tables"

/** calibrate.py: _DEFAULT_CURVE_CARRY_SLOPE (yards of carry per yard of signed curve). */
const DEFAULT_CURVE_CARRY_SLOPE = -0.2
/** calibrate.py: np.clip(curve_slope, -1.5, 0.5). */
const CURVE_SLOPE_MIN = -1.5
const CURVE_SLOPE_MAX = 0.5
/** calibrate.py: a regression needs at least this many shots and some spread. */
const MIN_SHOTS_FOR_SLOPE = 5
const MIN_SPREAD = 1e-6
/** calibrate.py --min-shots default. */
export const DEFAULT_MIN_SHOTS = 10

export interface FitShot {
  club: string
  carryYds: number
  /** Positive = right of target, negative = left. */
  offlineYds: number
  /** Start line in degrees (launch monitors only); same sign convention. */
  launchDirDeg?: number | null
  /** Curve in yards (launch monitors only); same sign convention. */
  curveYds?: number | null
  /** Relative importance of this shot; default 1. */
  weight?: number
}

/** What calibrate.py writes per club: the shape SyntheticGolfer(club_profiles=...) reads. */
export interface FittedProfile {
  mean_carry: number
  distance_cv: number
  direction_sd_deg: number
  start_line_bias_deg: number
  start_line_sd_deg: number
  curve_bias_pct: number
  curve_sd_pct: number
  curve_carry_slope: number
  n_shots: number
}

function round(x: number, places: number): number {
  const f = 10 ** places
  return Math.round(x * f) / f
}

function wMean(x: number[], w: number[]): number {
  let sw = 0
  let s = 0
  for (let i = 0; i < x.length; i++) {
    sw += w[i]
    s += w[i] * x[i]
  }
  return s / sw
}

function wStd(x: number[], w: number[]): number {
  if (x.length < 2) return NaN
  const m = wMean(x, w)
  let sw = 0
  let sw2 = 0
  let ss = 0
  for (let i = 0; i < x.length; i++) {
    sw += w[i]
    sw2 += w[i] * w[i]
    ss += w[i] * (x[i] - m) ** 2
  }
  const denom = sw - sw2 / sw // = n - 1 when all weights are 1
  return denom > 0 ? Math.sqrt(ss / denom) : NaN
}

/**
 * Population SD (divide by n). calibrate.py computes distance_cv with numpy's
 * `.std()` on an ndarray, which is ddof=0, unlike the pandas `.std()` it uses
 * for every other spread. Kept as-is so the fits agree.
 */
function wStdPop(x: number[], w: number[]): number {
  const m = wMean(x, w)
  let sw = 0
  let ss = 0
  for (let i = 0; i < x.length; i++) {
    sw += w[i]
    ss += w[i] * (x[i] - m) ** 2
  }
  return Math.sqrt(ss / sw)
}

/** Slope of y on x (np.polyfit degree 1), or null when x has no spread. */
function wSlope(x: number[], y: number[], w: number[]): number | null {
  const mx = wMean(x, w)
  const my = wMean(y, w)
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < x.length; i++) {
    sxy += w[i] * (x[i] - mx) * (y[i] - my)
    sxx += w[i] * (x[i] - mx) ** 2
  }
  return sxx > 0 ? sxy / sxx : null
}

function ptp(x: number[]): number {
  return Math.max(...x) - Math.min(...x)
}

export function calibrate(shots: FitShot[], minShots: number = DEFAULT_MIN_SHOTS): Record<string, FittedProfile> {
  const byClub = new Map<string, FitShot[]>()
  for (const s of shots) {
    const g = byClub.get(s.club)
    if (g) g.push(s)
    else byClub.set(s.club, [s])
  }

  const profile: Record<string, FittedProfile> = {}
  for (const [club, group] of Array.from(byClub)) {
    if (group.length < minShots) continue

    const w = group.map((s) => s.weight ?? 1)
    const carry = group.map((s) => s.carryYds)
    const direction = group.map((s) => (Math.atan2(s.offlineYds, s.carryYds) * 180) / Math.PI)
    const directionSd = wStd(direction, w)

    // Measured start line and curve exist only when EVERY shot in the club has
    // them (calibrate.py's `.notna().all()`); a club mixing launch-monitor and
    // hand-entered shots falls back wholesale.
    const measured = group.every((s) => Number.isFinite(s.launchDirDeg) && Number.isFinite(s.curveYds))

    let startBias: number
    let startSd: number
    let curveBiasPct: number
    let curveSdPct: number
    let curveSlope: number
    let curve: number[]
    if (measured) {
      const launch = group.map((s) => s.launchDirDeg as number)
      curve = group.map((s) => s.curveYds as number)
      const curvePct = curve.map((c, i) => c / carry[i])
      startBias = wMean(launch, w)
      startSd = wStd(launch, w)
      curveBiasPct = wMean(curvePct, w)
      curveSdPct = wStd(curvePct, w)
      const slope = curve.length >= MIN_SHOTS_FOR_SLOPE && ptp(curve) > MIN_SPREAD ? wSlope(curve, carry, w) : null
      curveSlope = slope == null ? DEFAULT_CURVE_CARRY_SLOPE : Math.min(CURVE_SLOPE_MAX, Math.max(CURVE_SLOPE_MIN, slope))
    } else {
      const share = CLUB_CURVE_SHARE[canonicalClub(club) ?? ("" as never)] ?? 0.5
      const totalRad = (directionSd * Math.PI) / 180
      startBias = wMean(direction, w)
      startSd = (totalRad * Math.sqrt(1 - share) * 180) / Math.PI
      curveBiasPct = 0
      curveSdPct = totalRad * Math.sqrt(share)
      curveSlope = DEFAULT_CURVE_CARRY_SLOPE
      curve = group.map(() => 0)
    }

    // The simulator subtracts the curve cost on every shot and adds back its
    // expected value, so the stored mean/CV describe carry BEFORE that effect.
    const curveMean = wMean(curve, w)
    const base = carry.map((c, i) => c - curveSlope * (curve[i] - curveMean))
    const meanCarry = wMean(base, w)
    const distanceCv = wStdPop(base, w) / meanCarry

    profile[club] = {
      mean_carry: round(meanCarry, 1),
      distance_cv: round(distanceCv, 4),
      direction_sd_deg: round(directionSd, 2),
      start_line_bias_deg: round(startBias, 2),
      start_line_sd_deg: round(startSd, 2),
      curve_bias_pct: round(curveBiasPct, 4),
      curve_sd_pct: round(curveSdPct, 4),
      curve_carry_slope: round(curveSlope, 3),
      n_shots: group.length,
    }
  }
  return profile
}
