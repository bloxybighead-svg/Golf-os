// "Plays like": what elevation change, wind and air temperature do to a shot. Carry is measured on
// a launch monitor, in still air on level ground; on the course the same swing
// goes farther downhill or downwind, shorter uphill or into the wind, and a
// crosswind pushes it sideways. Cold air is denser, so the ball carries shorter;
// hot air carries farther. Applied to every sampled shot inside the
// simulation (plan.ts simulateLandings), so the club ranking, the aim search
// and the penalty shares all see it.
//
// Every number below is an ESTIMATE from common golf rules of thumb (the
// "1 yard per 3 feet" elevation rule, a percent of carry per mph of wind), not
// measured for this golfer or this app. Treat them as starting points to tune.
//
// With no wind, no elevation and a temperature within TEMP_MIN_DIFF_F of the
// one the golfer's carries were measured at, adjustShot returns the shot
// untouched, so a still, flat, matching-temperature plan reproduces the plain
// simulation exactly.

import { landingPoint, type LatLng } from "./geo"
import { elevationAt, type ElevationField } from "./elevation"
import { clubGroup } from "./roll"

/** Wind as a weather service reports it: how fast, and the compass direction it blows FROM (0 = from the north). */
export interface Wind {
  speedMph: number
  fromDeg: number
}

export interface ShotConditions {
  wind: Wind | null
  elevation: ElevationField | null
  /** Air temperature now, degrees F. null = no adjustment. */
  temperatureF: number | null
  /** The temperature the golfer's carries were measured at, degrees F (DEFAULT_BASELINE_TEMP_F when absent). */
  baselineF?: number
}

// ---- Air temperature ------------------------------------------------------------

/**
 * Share of carry gained per 10 degrees F of warming (lost per 10 degrees of cooling), the same for every club.
 * ESTIMATE from published figures: TrackMan puts it at about 1.33-1.66 yd per 10 F (a TrackMan 9-iron carries up
 * to 7 yd farther at 95 F than at 55 F), and Titleist at about 1.5% per 20 F. 1% per 10 F sits at the strong end
 * of those: about 1.5 yd for a 150 yd carry. Hot and cold are symmetric.
 */
export const TEMP_CARRY_PER_10F = 0.01

/** The temperature never changes a carry by more than this share, however far it is from the baseline. A safety limit (0.06 is a 60 F gap). */
export const TEMP_MAX_CARRY_SHARE = 0.06

/** Temperature gaps smaller than this, degrees F, count as matching the baseline, so a matching temperature reproduces the plain simulation exactly (same rule as LEVEL_FT). */
export const TEMP_MIN_DIFF_F = 2

/** The temperature carries are taken to be measured at when the golfer hasn't said: handicap estimates and synthetic profiles. A typical mild day. */
export const DEFAULT_BASELINE_TEMP_F = 70

/** Cold-day advice shows under this temperature, degrees F. ESTIMATE: a ball's compression clearly stiffens below the mid 40s. */
export const COLD_TIP_BELOW_F = 45

/**
 * Signed share of carry the temperature adds (negative = cold, shorter): TEMP_CARRY_PER_10F per 10 F from the
 * baseline, limited to +-TEMP_MAX_CARRY_SHARE. Zero with no reading or a gap under TEMP_MIN_DIFF_F.
 */
export function temperatureCarryShare(temperatureF: number | null | undefined, baselineF: number = DEFAULT_BASELINE_TEMP_F): number {
  if (temperatureF == null || !Number.isFinite(temperatureF) || !Number.isFinite(baselineF)) return 0
  const diff = temperatureF - baselineF
  if (Math.abs(diff) < TEMP_MIN_DIFF_F) return 0
  return Math.max(-TEMP_MAX_CARRY_SHARE, Math.min(TEMP_MAX_CARRY_SHARE, (TEMP_CARRY_PER_10F * diff) / 10))
}

// ---- Elevation ---------------------------------------------------------------

/** Feet of rise or drop between the ball and where it lands that changes the carry by one yard. ESTIMATE: the common "1 yd per 3 ft" rule (spec). */
export const ELEVATION_FT_PER_YD = 3

/**
 * Height differences smaller than this, feet, count as level. Interpolating a flat field gives numbers that differ
 * by float noise, and level ground must reproduce the plain simulation exactly. A tenth of a foot is a twentieth of
 * a yard of carry, far below the model's own error.
 */
export const LEVEL_FT = 0.1

/** Fixed-point passes to settle where a shot lands (its height depends on the carry, which depends on its height). Three is within a third of a yard on a steep slope. */
const ELEVATION_ITERATIONS = 3

// ---- Wind --------------------------------------------------------------------

/** Share of carry lost per mph of headwind, for an iron. ESTIMATE (spec): about 1% per mph. */
export const HEADWIND_CARRY_PER_MPH = 0.01

/** Share of carry gained per mph of tailwind, for an iron. ESTIMATE (spec): about half a headwind's effect, because a tailwind also takes spin and lift off the ball. */
export const TAILWIND_CARRY_PER_MPH = 0.005

/** Wind affects higher-spin, higher-launching clubs more. ESTIMATES, as multiples of the iron figures: driver less, wedges more. */
export const WIND_SPIN_FACTOR = { driver: 0.8, wood: 0.9, iron: 1, wedge: 1.25 } as const

/** The wind never changes a carry by more than this share, however hard it blows. A safety limit (30 mph x 1% x 1.25 is already 37%). */
export const MAX_WIND_CARRY_SHARE = 0.4

/** Sideways drift per mph of crosswind per 100 yd of carry, yards. ESTIMATE: a 10 mph crosswind moves a 150 yd iron about 6 yd. */
export const CROSSWIND_DRIFT_YD_PER_MPH_PER_100YD = 0.4

// ---- Roll --------------------------------------------------------------------

/** Share of rollout lost per mph of headwind (gained per mph of tailwind). ESTIMATE: a ball into the wind lands steeper and stops sooner. */
export const ROLL_WIND_PER_MPH = 0.02

/** Share of rollout lost per percent of uphill grade at the landing spot (gained when downhill). ESTIMATE. */
export const ROLL_PER_PCT_GRADE = 0.03

/** How far back along the shot the ground is read to get the slope where it lands, yards. */
const GRADE_SPAN_YDS = 10

/** Rollout scale limits, so a steep slope or hard wind never doubles or erases the run. ESTIMATE. */
export const ROLL_SCALE_MIN = 0.25
export const ROLL_SCALE_MAX = 2

// ---- Clubs ---------------------------------------------------------------------

export type SpinGroup = keyof typeof WIND_SPIN_FACTOR

/** "Driver", "3-Wood" / "Hybrid", wedges (PW, GW, AW, SW, LW) and everything else (irons). */
export function spinGroup(club: string): SpinGroup {
  const c = club.toLowerCase()
  if (c.includes("driver")) return "driver"
  if (c.includes("wood") || c.includes("hybrid") || /^\d+\s*-?\s*(w|h)$/.test(c)) return "wood"
  if (c.includes("wedge") || /^(pw|gw|aw|sw|lw)$/.test(c)) return "wedge"
  return "iron"
}

// ---- Wind components -----------------------------------------------------------

export interface WindComponents {
  /** Mph blowing into the golfer's face along the shot (negative = behind them). */
  headMph: number
  /** Mph pushing the ball to the right (negative = to the left): wind from the left is positive. */
  crossRightMph: number
}

/** Splits the wind into along-the-shot and across-the-shot parts for a shot heading `bearing` degrees. */
export function windComponents(wind: Wind | null, bearing: number): WindComponents {
  if (!wind || wind.speedMph <= 0) return { headMph: 0, crossRightMph: 0 }
  const rel = ((wind.fromDeg - bearing) * Math.PI) / 180
  return { headMph: wind.speedMph * Math.cos(rel), crossRightMph: -wind.speedMph * Math.sin(rel) }
}

/**
 * Signed share of carry the wind takes away: positive = shorter (headwind),
 * negative = longer (tailwind). Limited to +-MAX_WIND_CARRY_SHARE.
 */
export function windCarryShare(club: string, headMph: number): number {
  if (headMph === 0) return 0
  const spin = WIND_SPIN_FACTOR[spinGroup(club)]
  const per = headMph > 0 ? HEADWIND_CARRY_PER_MPH : TAILWIND_CARRY_PER_MPH
  return Math.max(-MAX_WIND_CARRY_SHARE, Math.min(MAX_WIND_CARRY_SHARE, headMph * per * spin))
}

/** Sideways drift of a shot of this carry in this crosswind, yards (right positive). */
export function crosswindDriftYds(club: string, carryYds: number, crossRightMph: number): number {
  if (crossRightMph === 0) return 0
  return crossRightMph * CROSSWIND_DRIFT_YD_PER_MPH_PER_100YD * (carryYds / 100) * WIND_SPIN_FACTOR[spinGroup(club)]
}

/** Whether these conditions change anything at all. */
export function hasEffect(c: ShotConditions | null | undefined): c is ShotConditions {
  return !!c && ((!!c.wind && c.wind.speedMph > 0) || !!c.elevation || temperatureCarryShare(c.temperatureF, c.baselineF) !== 0)
}

/** A height difference with float noise taken out: anything under LEVEL_FT is zero. */
function level(ft: number): number {
  return Math.abs(ft) < LEVEL_FT ? 0 : ft
}

// ---- One shot ------------------------------------------------------------------

export interface ShotAdjustment {
  carryYds: number
  offlineYds: number
  /** Multiplies the shot's rollout (1 = unchanged). */
  rollScale: number
}

/**
 * The carry, offline and rollout a sampled shot really gets: the air
 * temperature first (a share of the carry), then the wind on that carry (a
 * share of it and a sideways drift), then the ground height where it
 * comes down (1 yd per ELEVATION_FT_PER_YD feet). `bearing` is the direction the
 * golfer aims. Untouched when nothing applies.
 */
export function adjustShot(club: string, carryYds: number, offlineYds: number, from: LatLng, bearing: number, c: ShotConditions | null | undefined): ShotAdjustment {
  if (!hasEffect(c)) return { carryYds, offlineYds, rollScale: 1 }
  const tempShare = temperatureCarryShare(c.temperatureF, c.baselineF)
  const warmCarry = tempShare === 0 ? carryYds : carryYds * (1 + tempShare)
  const { headMph, crossRightMph } = windComponents(c.wind, bearing)
  const share = windCarryShare(club, headMph)
  const windCarry = share === 0 ? warmCarry : warmCarry * (1 - share)
  const offline = crossRightMph === 0 ? offlineYds : offlineYds + crosswindDriftYds(club, warmCarry, crossRightMph)

  let carry = windCarry
  let landing: LatLng | null = null
  const field = c.elevation
  const ballFt = field ? elevationAt(field, from) : null
  if (field && ballFt != null) {
    for (let i = 0; i < ELEVATION_ITERATIONS; i++) {
      landing = landingPoint(from, bearing, carry, offline)
      const ft = elevationAt(field, landing)
      carry = Math.max(0, windCarry - level(ft == null ? 0 : ft - ballFt) / ELEVATION_FT_PER_YD)
    }
    landing = landingPoint(from, bearing, carry, offline)
  }

  let rollScale = 1
  if (clubGroup(club) !== "noRoll") {
    rollScale -= headMph * ROLL_WIND_PER_MPH
    if (field && landing) {
      const here = elevationAt(field, landing)
      const back = elevationAt(field, landingPoint(from, bearing, Math.max(0, carry - GRADE_SPAN_YDS), offline))
      if (here != null && back != null) {
        const gradePct = (level(here - back) / (GRADE_SPAN_YDS * 3)) * 100 // ft per ft, in percent (uphill positive)
        rollScale -= gradePct * ROLL_PER_PCT_GRADE
      }
    }
    rollScale = Math.max(ROLL_SCALE_MIN, Math.min(ROLL_SCALE_MAX, rollScale))
  }
  return { carryYds: carry, offlineYds: offline, rollScale }
}

// ---- The card's "plays like" number --------------------------------------------

export interface PlaysLike {
  /** The distance as it plays, yards: the still-air, level-ground carry needed to cover it. */
  playsYds: number
  /** Yards added (positive: uphill) or taken off (negative: downhill) for the height change. */
  elevationYds: number
  /** Yards added (headwind) or taken off (tailwind) for the wind. */
  windYds: number
  /** Yards added (cold air) or taken off (warm air) for the temperature; 0 when it matches the baseline. */
  temperatureYds: number
  /** The air temperature, degrees F, when it changes the shot; null otherwise. For the label only. */
  temperatureF: number | null
  /** Crosswind component, mph, right positive (wind from the left); 0 with no wind. For the label only. */
  crossRightMph: number
}

/**
 * The distance to a target as it plays for `club`: the flat, still-air carry
 * that would cover it. The inverse of adjustShot's carry rule, so the card and
 * the simulation agree: actual = c(1 + temp share)(1 - wind share) - rise/3, so
 * c = (d + rise/3) / ((1 - wind share)(1 + temp share)). Null when there is
 * nothing to adjust.
 */
export function playsLike(
  distYds: number,
  from: LatLng,
  to: LatLng,
  bearing: number,
  club: string,
  c: ShotConditions | null | undefined
): PlaysLike | null {
  if (!hasEffect(c)) return null
  const { headMph, crossRightMph } = windComponents(c.wind, bearing)
  const share = windCarryShare(club, headMph)
  let riseFt = 0
  if (c.elevation) {
    const a = elevationAt(c.elevation, from)
    const b = elevationAt(c.elevation, to)
    if (a != null && b != null) riseFt = level(b - a)
  }
  const elevationYds = riseFt / ELEVATION_FT_PER_YD
  const tempShare = temperatureCarryShare(c.temperatureF, c.baselineF)
  const windNeeded = (distYds + elevationYds) / (1 - share)
  const needed = windNeeded / (1 + tempShare)
  return {
    playsYds: needed,
    elevationYds,
    windYds: windNeeded - distYds - elevationYds,
    temperatureYds: needed - windNeeded,
    temperatureF: tempShare === 0 ? null : (c.temperatureF as number),
    crossRightMph,
  }
}

/** "-8 downhill, -4 wind helping, +4 cold (48°F), 6 mph from the left": only the parts that matter (half a yard or more). */
export function playsLikeBreakdown(p: PlaysLike): string {
  const parts: string[] = []
  const sign = (n: number) => `${n < 0 ? "-" : "+"}${Math.abs(Math.round(n))}`
  if (Math.abs(p.elevationYds) >= 0.5) parts.push(`${sign(p.elevationYds)} ${p.elevationYds < 0 ? "downhill" : "uphill"}`)
  if (Math.abs(p.windYds) >= 0.5) parts.push(`${sign(p.windYds)} wind ${p.windYds < 0 ? "helping" : "into you"}`)
  if (p.temperatureF != null && Math.abs(p.temperatureYds) >= 0.5) parts.push(`${sign(p.temperatureYds)} ${p.temperatureYds > 0 ? "cold" : "warm"} (${Math.round(p.temperatureF)}°F)`)
  if (Math.abs(p.crossRightMph) >= 1) parts.push(`${Math.round(Math.abs(p.crossRightMph))} mph from the ${p.crossRightMph > 0 ? "left" : "right"}`)
  return parts.join(", ")
}

/** A key for the pieces of the conditions that change a ranking (part of rankKey and the worker's grid cache key). */
export function conditionsKey(c: ShotConditions | null | undefined): string {
  if (!hasEffect(c)) return "-"
  const w = c.wind && c.wind.speedMph > 0 ? `${Math.round(c.wind.speedMph)}@${Math.round(c.wind.fromDeg)}` : "calm"
  const share = temperatureCarryShare(c.temperatureF, c.baselineF)
  const t = share === 0 ? "" : `|${Math.round(c.temperatureF as number)}F/${Math.round(c.baselineF ?? DEFAULT_BASELINE_TEMP_F)}F`
  return `${w}|${c.elevation?.id ?? "flat"}${t}`
}
