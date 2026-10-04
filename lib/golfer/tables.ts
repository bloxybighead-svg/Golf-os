// Ported from shot-pattern-simulator/synthetic_golfer.py's handicap/band
// path (DEFAULT_PROFILES, profiles_for_handicap, scale_profiles_to_carries).
// Keep this in sync with that file -- it's the source of truth and carries
// the citations for every number here -- except the 7-Wood and LW entries,
// which exist only in this port (added so a real bag can hold them) and are
// interpolated from their neighbours, not sourced. This port intentionally excludes
// from_profile_json/calibrate.py (real-shot calibration), which has no
// browser equivalent since it needs a real golfer's launch-monitor history.

export interface ClubProfile {
  mean_carry: number
  distance_cv: number
  direction_sd_deg: number
  // Set only on a profile fitted from a golfer's own shots (calibrate.ts):
  // start line and curve measured directly instead of split by CLUB_CURVE_SHARE.
  start_line_bias_deg?: number
  start_line_sd_deg?: number
  curve_bias_pct?: number
  curve_sd_pct?: number
  curve_carry_slope?: number
}

export const BAG_ORDER = [
  "Driver", "3-Wood", "5-Wood", "7-Wood", "4-Iron", "5-Iron", "6-Iron",
  "7-Iron", "8-Iron", "9-Iron", "PW", "GW", "SW", "LW",
] as const
export type Club = (typeof BAG_ORDER)[number]

const CLUB_DIRECTION_RATIO: Record<Club, number> = {
  Driver: 1.0, "3-Wood": 0.95, "5-Wood": 0.9, "7-Wood": 0.87, // 7-Wood: between 5-Wood and 4-Iron (assumed)
  "4-Iron": 0.85, "5-Iron": 0.82, "6-Iron": 0.8, "7-Iron": 0.77,
  "8-Iron": 0.75, "9-Iron": 0.73, PW: 0.7, GW: 0.7, SW: 0.7, LW: 0.7, // LW: same as the other wedges (assumed)
}

export const CLUB_CURVE_SHARE: Record<Club, number> = {
  Driver: 0.7, "3-Wood": 0.68, "5-Wood": 0.64, "7-Wood": 0.62, // 7-Wood, LW: continue the trend (assumed)
  "4-Iron": 0.6, "5-Iron": 0.57, "6-Iron": 0.55, "7-Iron": 0.53,
  "8-Iron": 0.47, "9-Iron": 0.42, PW: 0.36, GW: 0.31, SW: 0.26, LW: 0.22,
}

type Tier = "tour" | "pro" | "low_handicap" | "mid_handicap" | "high_handicap"

// tier -> [driver direction SD in degrees, base distance CV]
const TIER_CALIBRATION: Record<Tier, [number, number]> = {
  tour: [4.0, 0.035],
  pro: [4.5, 0.045],
  low_handicap: [5.4, 0.055],
  mid_handicap: [6.4, 0.075],
  high_handicap: [8.1, 0.11],
}

const IRON_RATIOS: Partial<Record<Club, number>> = {
  "4-Iron": 1.18, "5-Iron": 1.128, "6-Iron": 1.064, "7-Iron": 1.0,
  "8-Iron": 0.93, "9-Iron": 0.86, PW: 0.78, GW: 0.724, SW: 0.607,
  LW: 0.52, // ~15 yd short of SW at a 150-yd 7-iron (assumed, not sourced)
}

const TIER_GAP_SCALE: Record<Tier, number> = {
  tour: 1.0, pro: 1.0, low_handicap: 0.96, mid_handicap: 0.92, high_handicap: 0.87,
}

const TIER_LONG_CLUBS: Record<Tier, { Driver: number; "3-Wood": number; "5-Wood": number; "7-Iron": number }> = {
  tour: { Driver: 275, "3-Wood": 243, "5-Wood": 230, "7-Iron": 172 },
  pro: { Driver: 250, "3-Wood": 225, "5-Wood": 210, "7-Iron": 165 },
  low_handicap: { Driver: 232, "3-Wood": 210, "5-Wood": 196, "7-Iron": 153 },
  mid_handicap: { Driver: 205, "3-Wood": 188, "5-Wood": 175, "7-Iron": 138 },
  high_handicap: { Driver: 183, "3-Wood": 168, "5-Wood": 155, "7-Iron": 122 },
}

const CLUB_DISTANCE_RATIO: Record<Club, number> = {
  Driver: 1.0, "3-Wood": 0.95, "5-Wood": 0.93, "7-Wood": 0.85, // 7-Wood, LW: continue the trend (assumed)
  "4-Iron": 0.75, "5-Iron": 0.65, "6-Iron": 0.63, "7-Iron": 0.65,
  "8-Iron": 0.72, "9-Iron": 0.8, PW: 0.88, GW: 0.95, SW: 1.0, LW: 1.05,
}

function buildTierCarries(): Record<Tier, Record<Club, number>> {
  const carries = {} as Record<Tier, Record<Club, number>>
  for (const tier of Object.keys(TIER_LONG_CLUBS) as Tier[]) {
    const longs = TIER_LONG_CLUBS[tier]
    const anchor = longs["7-Iron"]
    const scale = TIER_GAP_SCALE[tier]
    const row = { Driver: longs.Driver, "3-Wood": longs["3-Wood"], "5-Wood": longs["5-Wood"] } as Record<Club, number>
    for (const club of BAG_ORDER) {
      const ratio = IRON_RATIOS[club]
      if (ratio !== undefined) {
        row[club] = Math.round(anchor * (1.0 + (ratio - 1.0) * scale) * 10) / 10
      }
    }
    row["7-Iron"] = anchor
    // 7-Wood: halfway between the 5-Wood and the 4-Iron (assumed).
    row["7-Wood"] = Math.round(((row["5-Wood"] + row["4-Iron"]) / 2) * 10) / 10
    carries[tier] = row
  }
  return carries
}

const TIER_CARRIES = buildTierCarries()

function buildDefaultProfiles(): Record<Tier, Record<Club, ClubProfile>> {
  const profiles = {} as Record<Tier, Record<Club, ClubProfile>>
  for (const tier of Object.keys(TIER_CALIBRATION) as Tier[]) {
    const [driverSd, baseCv] = TIER_CALIBRATION[tier]
    const row = {} as Record<Club, ClubProfile>
    for (const club of BAG_ORDER) {
      const carry = TIER_CARRIES[tier][club]
      const cv = baseCv * CLUB_DISTANCE_RATIO[club]
      row[club] = {
        mean_carry: carry,
        distance_cv: Math.round(cv * 10000) / 10000,
        direction_sd_deg: Math.round(driverSd * CLUB_DIRECTION_RATIO[club] * 100) / 100,
      }
    }
    profiles[tier] = row
  }
  return profiles
}

export const DEFAULT_PROFILES = buildDefaultProfiles()

/**
 * A club's typical carry for a low-handicap golfer. Only the RATIO between two
 * clubs is used (to estimate a club a golfer has no data for from one they do),
 * so the tier choice barely matters.
 */
export function referenceCarry(club: Club): number {
  return DEFAULT_PROFILES.low_handicap[club].mean_carry
}

export const GOLFER_BIAS_SD_DEG: Record<Tier, number> = {
  tour: 0.4, pro: 0.5, low_handicap: 1.0, mid_handicap: 2.0, high_handicap: 3.5,
}

export const GOLFER_BIAS_MEAN_DEG: Record<Tier, number> = {
  tour: 0.0, pro: 0.0, low_handicap: 0.0, mid_handicap: 0.4, high_handicap: 0.8,
}

const MISHIT_RATE_ANCHORS: [number[], number[]] = [[0, 6, 15, 24], [0.03, 0.04, 0.06, 0.08]]

export const ANCHOR_HANDICAPS: Record<Tier, number> = {
  tour: -4, pro: 0, low_handicap: 6, mid_handicap: 15, high_handicap: 24,
}

export const HANDICAP_BANDS: Record<string, number> = {
  plus: -2.0, "0-2": 1.0, "2-4": 3.0, "4-6": 5.0, "6-8": 7.0,
  "8-12": 10.0, "12-18": 15.0, "18+": 22.0,
}

function interp(x: number, xp: number[], fp: number[]): number {
  // Matches numpy.interp: clamps outside the range instead of extrapolating.
  if (x <= xp[0]) return fp[0]
  if (x >= xp[xp.length - 1]) return fp[fp.length - 1]
  for (let i = 0; i < xp.length - 1; i++) {
    if (x >= xp[i] && x <= xp[i + 1]) {
      const t = (x - xp[i]) / (xp[i + 1] - xp[i])
      return fp[i] + t * (fp[i + 1] - fp[i])
    }
  }
  return fp[fp.length - 1]
}

const TIERS_BY_HANDICAP = (Object.keys(ANCHOR_HANDICAPS) as Tier[]).sort(
  (a, b) => ANCHOR_HANDICAPS[a] - ANCHOR_HANDICAPS[b]
)

export function profilesForHandicap(handicapIndex: number): Record<Club, ClubProfile> {
  const xp = TIERS_BY_HANDICAP.map((t) => ANCHOR_HANDICAPS[t])
  const result = {} as Record<Club, ClubProfile>
  for (const club of BAG_ORDER) {
    result[club] = {
      mean_carry: interp(handicapIndex, xp, TIERS_BY_HANDICAP.map((t) => DEFAULT_PROFILES[t][club].mean_carry)),
      distance_cv: interp(handicapIndex, xp, TIERS_BY_HANDICAP.map((t) => DEFAULT_PROFILES[t][club].distance_cv)),
      direction_sd_deg: interp(handicapIndex, xp, TIERS_BY_HANDICAP.map((t) => DEFAULT_PROFILES[t][club].direction_sd_deg)),
    }
  }
  return result
}

function interpTierScalar(handicapIndex: number, perTier: Record<Tier, number>): number {
  const xp = TIERS_BY_HANDICAP.map((t) => ANCHOR_HANDICAPS[t])
  const fp = TIERS_BY_HANDICAP.map((t) => perTier[t])
  return interp(handicapIndex, xp, fp)
}

export function biasSdForHandicap(handicapIndex: number): number {
  return interpTierScalar(handicapIndex, GOLFER_BIAS_SD_DEG)
}

export function biasMeanForHandicap(handicapIndex: number): number {
  return interpTierScalar(handicapIndex, GOLFER_BIAS_MEAN_DEG)
}

export function mishitRateForHandicap(handicapIndex: number): number {
  const [xp, fp] = MISHIT_RATE_ANCHORS
  return Math.round(interp(handicapIndex, xp, fp) * 1000) / 1000
}

/**
 * Rescale a tier's mean carries to fit a specific player's numbers.
 * Handicap controls dispersion SHAPE; the player's own carries control
 * SCALE. Clubs named in knownCarries get their exact value; every other
 * club's mean carry is rescaled by a ratio interpolated across the bag
 * (ordered by anchor carry), held flat past the ends.
 */
export function scaleProfilesToCarries(
  profiles: Record<Club, ClubProfile>,
  knownCarries: Partial<Record<Club, number>>
): Record<Club, ClubProfile> {
  const entries = Object.entries(knownCarries) as [Club, number][]
  const ratios = entries
    .map(([club, carry]) => [profiles[club].mean_carry, carry / profiles[club].mean_carry] as [number, number])
    .sort((a, b) => a[0] - b[0])
  const xp = ratios.map((r) => r[0])
  const fp = ratios.map((r) => r[1])

  const result = {} as Record<Club, ClubProfile>
  for (const club of Object.keys(profiles) as Club[]) {
    const params = profiles[club]
    if (club in knownCarries) {
      result[club] = { ...params, mean_carry: knownCarries[club]! }
    } else if (xp.length > 0) {
      const ratio = interp(params.mean_carry, xp, fp)
      result[club] = { ...params, mean_carry: Math.round(params.mean_carry * ratio * 10) / 10 }
    } else {
      result[club] = { ...params }
    }
  }
  return result
}
