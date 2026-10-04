// Shots from a FITTED profile: the per-club output of
// shot-pattern-simulator/calibrate.py (carry mean/CV, start-line and curve
// bias/spread, curve-carry slope). A port of SyntheticGolfer.sample_shots()'s
// fitted-profile path, run the way from_profile_json runs it: no mishits, no
// session drift, no golfer-level bias on top of the per-club one. Used by the
// regression tests, so they need no Supabase connection and no raw shots.
// The carry logic is shared with generate.ts (same constants, same clamps).

import { makeRng, randNormal, type Rng } from "./rng"

export interface FittedClubProfile {
  mean_carry: number
  distance_cv: number
  start_line_bias_deg: number
  start_line_sd_deg: number
  curve_bias_pct: number
  curve_sd_pct: number
  curve_carry_slope: number
}

export type FittedProfile = Record<string, FittedClubProfile>

const HALF_NORMAL_MEAN = Math.sqrt(2 / Math.PI)
const UPPER_TAIL_CV = 0.04
const MAX_CARRY_RATIO = 1.11
const MIN_CARRY_K = 1.8

function asymmetryFor(cv: number): number {
  if (cv <= UPPER_TAIL_CV) return 0.05
  return Math.min(0.7, Math.max(0.05, 1.0 - UPPER_TAIL_CV / cv))
}

export function fittedShot(p: FittedClubProfile, rng: Rng): { carryYds: number; offlineYds: number } {
  const distanceSd = p.mean_carry * p.distance_cv
  const a = asymmetryFor(p.distance_cv)
  let z = randNormal(rng)
  z = z < 0 ? z * (1.0 + a) : z * (1.0 - a)
  let carry = Math.max(0, p.mean_carry + z * distanceSd + HALF_NORMAL_MEAN * a * distanceSd)

  const startLine = randNormal(rng, p.start_line_bias_deg, p.start_line_sd_deg)
  const curve = randNormal(rng, p.curve_bias_pct * carry, p.curve_sd_pct * carry)
  carry = Math.max(0, carry + p.curve_carry_slope * (curve - p.curve_bias_pct * carry))

  const ceiling = p.mean_carry * MAX_CARRY_RATIO
  if (carry > ceiling) carry = ceiling + (carry - ceiling) * 0.15
  const floor = p.mean_carry * (1.0 - MIN_CARRY_K * p.distance_cv)
  if (carry < floor) {
    const taper = floor * 0.05
    carry = floor - taper * (1.0 - Math.exp(-(floor - carry) / taper))
  }
  return { carryYds: carry, offlineYds: carry * Math.tan((startLine * Math.PI) / 180) + curve }
}

/** `perClub` shots for every club in the profile, reproducible from `seed`. */
export function generateFromFittedProfile(
  profile: FittedProfile,
  perClub: number,
  seed: number
): { club: string; shots: { carryYds: number; offlineYds: number }[] }[] {
  const rng = makeRng(seed)
  return Object.entries(profile).map(([club, p]) => ({
    club,
    shots: Array.from({ length: perClub }, () => fittedShot(p, rng)),
  }))
}
