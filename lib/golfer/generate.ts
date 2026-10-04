// Ported from SyntheticGolfer.sample_shots() in
// shot-pattern-simulator/synthetic_golfer.py. Keep this in sync with that
// file's carry/direction/curve/clamp logic -- the comments there carry the
// full citations and reasoning; here they're kept short and point back.

import { makeRng, randNormal, randChoice, type Rng } from "./rng"
import { CLUB_CURVE_SHARE, type Club, type ClubProfile } from "./tables"

const HALF_NORMAL_MEAN = Math.sqrt(2 / Math.PI)
const SKEW_MEAN_SHIFT = HALF_NORMAL_MEAN
const UPPER_TAIL_CV = 0.04
const MAX_CARRY_RATIO = 1.11
const MIN_CARRY_K = 1.8
const DEFAULT_CURVE_CARRY_SLOPE = -0.2

export interface GolferConfig {
  clubProfiles: Record<Club, ClubProfile>
  biasSdDeg: number
  biasMeanDeg: number
  mishitRate: number
  mishitMultiplier?: number // default 2.5
  mishitCarryLoss?: number // default 0.10
  driftDirectionSdDeg?: number // default 0.8
  driftDistanceSdPct?: number // default 0.015
  sessionSize?: number // default 60
  twoWayMiss?: boolean // default false
}

export interface GeneratedShot {
  club: Club
  carryYds: number
  offlineYds: number
  startLineDeg: number
  curveYds: number
  directionDeg: number
  isMishit: boolean
}

function asymmetryFor(cv: number): number {
  if (cv <= UPPER_TAIL_CV) return 0.05
  return Math.min(0.7, Math.max(0.05, 1.0 - UPPER_TAIL_CV / cv))
}

export function generateShots(
  config: GolferConfig,
  nShots: number,
  seed: number,
  clubs?: Club[]
): GeneratedShot[] {
  const rng: Rng = makeRng(seed)
  const {
    clubProfiles,
    biasSdDeg,
    biasMeanDeg,
    mishitRate,
    mishitMultiplier = 2.5,
    mishitCarryLoss = 0.1,
    driftDirectionSdDeg = 0.8,
    driftDistanceSdPct = 0.015,
    sessionSize = 60,
    twoWayMiss = false,
  } = config

  const clubList = clubs && clubs.length > 0 ? clubs : (Object.keys(clubProfiles) as Club[])
  const golferBiasDeg = randNormal(rng, biasMeanDeg, biasSdDeg)

  let sessionDirectionDrift = 0
  let sessionDistanceScale = 0
  const shots: GeneratedShot[] = []

  for (let i = 0; i < nShots; i++) {
    if (i % sessionSize === 0) {
      sessionDirectionDrift = randNormal(rng, 0, driftDirectionSdDeg)
      sessionDistanceScale = randNormal(rng, 0, driftDistanceSdPct)
    }

    const club = randChoice(rng, clubList)
    const profile = clubProfiles[club]
    const isMishit = rng() < mishitRate
    // Mishits widen DIRECTION spread (not distance -- a bad strike loses
    // carry, handled separately below, not scatter symmetrically). No
    // club_weights/improvement_per_session in this port (not exposed by
    // the browser UI), so spread reduces to just the mishit multiplier.
    const spread = isMishit ? mishitMultiplier : 1.0

    // --- carry: asymmetric (negative skew) ---
    const meanCarry = profile.mean_carry * (1 + sessionDistanceScale + mishitRate * mishitCarryLoss * HALF_NORMAL_MEAN)
    const distanceSd = profile.mean_carry * profile.distance_cv
    const a = asymmetryFor(profile.distance_cv)
    let z = randNormal(rng)
    z = z < 0 ? z * (1.0 + a) : z * (1.0 - a)
    const skewOffset = SKEW_MEAN_SHIFT * a * distanceSd
    let carryYds = Math.max(0, meanCarry + z * distanceSd + skewOffset)

    if (isMishit) {
      carryYds *= 1.0 - Math.abs(randNormal(rng, 0, mishitCarryLoss))
    }

    // --- direction: start line + curve ---
    // A profile fitted from the golfer's own shots carries the measured start
    // line and curve (synthetic_golfer.py: `"start_line_sd_deg" in profile`);
    // any other profile splits its total direction SD by the club's curve share.
    const fitted = profile.start_line_sd_deg !== undefined && profile.curve_sd_pct !== undefined
    let startSdDeg: number
    let curveSdPct: number
    let clubBiasDeg = 0
    let curveBiasPct = 0
    let slope = DEFAULT_CURVE_CARRY_SLOPE
    if (fitted) {
      startSdDeg = profile.start_line_sd_deg as number
      curveSdPct = profile.curve_sd_pct as number
      clubBiasDeg = profile.start_line_bias_deg ?? 0
      curveBiasPct = profile.curve_bias_pct ?? 0
      slope = profile.curve_carry_slope ?? DEFAULT_CURVE_CARRY_SLOPE
    } else {
      const curveShare = CLUB_CURVE_SHARE[club] ?? 0.5
      const totalSdRad = (profile.direction_sd_deg * Math.PI) / 180
      startSdDeg = (totalSdRad * Math.sqrt(1.0 - curveShare) * 180) / Math.PI
      curveSdPct = totalSdRad * Math.sqrt(curveShare)
    }

    let bias = golferBiasDeg + clubBiasDeg
    if (twoWayMiss) {
      bias = Math.abs(bias) * (rng() < 0.5 ? -1 : 1)
    }

    const startLineDeg = randNormal(rng, bias + sessionDirectionDrift, startSdDeg * spread)
    const curveYds = randNormal(rng, curveBiasPct * carryYds, curveSdPct * carryYds * spread)

    // --- curve<->carry link (tilts the dispersion ellipse) ---
    const expectedCurve = curveBiasPct * carryYds
    carryYds = Math.max(0, carryYds + slope * (curveYds - expectedCurve))

    // --- ceiling ---
    const ceiling = meanCarry * MAX_CARRY_RATIO
    if (carryYds > ceiling) {
      carryYds = ceiling + (carryYds - ceiling) * 0.15
    }

    // --- floor: smooth exponential taper, mishits exempt (see the
    // synthetic_golfer.py comment this is ported from for why) ---
    const floor = profile.mean_carry * (1.0 - MIN_CARRY_K * profile.distance_cv)
    if (carryYds < floor && !isMishit) {
      const deficit = floor - carryYds
      const taperScale = floor * 0.05
      carryYds = floor - taperScale * (1.0 - Math.exp(-deficit / taperScale))
    }

    const offlineYds = carryYds * Math.tan((startLineDeg * Math.PI) / 180) + curveYds
    const directionDeg = (Math.atan2(offlineYds, Math.max(carryYds, 1e-6)) * 180) / Math.PI

    shots.push({
      club,
      carryYds: Math.round(carryYds * 10) / 10,
      offlineYds: Math.round(offlineYds * 100) / 100,
      startLineDeg: Math.round(startLineDeg * 100) / 100,
      curveYds: Math.round(curveYds * 100) / 100,
      directionDeg: Math.round(directionDeg * 100) / 100,
      isMishit,
    })
  }

  return shots
}
