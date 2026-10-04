// A golfer's own calibrated profile: fit it from their saved shots (recency and
// surface weighted), judge how much to trust each club, blend thin clubs toward
// the handicap profile, and generate the planner's shots from it in the browser.
//
// The fit is calibrate.ts (a port of calibrate.py); generation for fitted clubs
// is fitted.ts (13b's port of the fitted-profile path of SyntheticGolfer), so
// the planner and the regression tests sample a profile the same way.

import type { SessionMeta, StoredShot } from "@/lib/shots/types"
import { calibrate, type FittedProfile, type FitShot } from "./calibrate"
import { generateCustomGolferShots } from "./build"
import { generateFromFittedProfile, type FittedClubProfile } from "./fitted"
import { BAG_ORDER, CLUB_CURVE_SHARE, profilesForHandicap, scaleProfilesToCarries, type Club, type ClubProfile } from "./tables"

// ---- tunables (each one: where it came from, or that it is an estimate) ----

/** A shot's weight halves every this many days. An estimate: a swing changes over a season, so ~3 months. */
export const RECENCY_HALF_LIFE_DAYS = 90
/**
 * Weight of mat or indoor shots, relative to 1 for outdoor-grass shots, for a
 * club that has both kinds. An estimate: mats flatter strikes and nets stop the
 * ball, so real-course data should dominate without discarding the mat data.
 */
export const MAT_INDOOR_WEIGHT = 0.4
/** Fewer shots than this and a club is treated as having no data. An estimate: a spread from 4 shots means little, and the slope fit itself needs 5. */
export const MIN_FIT_SHOTS = 5
/** "Thin" below this many shots (README: clubs under ~15-20 real shots are low-confidence); the blend weight is n / THIN_BELOW. */
export const THIN_BELOW = 15
/** README power analysis: shots for a +-2 yd 95% interval on mean carry, about 35 for an iron and about 140 for the driver. */
export const SOLID_SHOTS_IRON = 35
export const SOLID_SHOTS_DRIVER = 140
/** Woods: between the two, since their spread is. An estimate (the README gives only iron and driver). */
export const SOLID_SHOTS_WOOD = 70
/** The simulator's default curve-carry slope (calibrate.py / synthetic_golfer.py _DEFAULT_CURVE_CARRY_SLOPE). */
const DEFAULT_CURVE_CARRY_SLOPE = -0.2
/** Shots generated per club for the planner. */
export const MY_SHOTS_PER_CLUB = 1000
/** Fixed seed, so a given profile always yields the same shots. Arbitrary. */
export const MY_SHOTS_SEED = 17

export type Badge = "solid" | "ok" | "thin"

export function solidShotsFor(club: Club): number {
  if (club === "Driver") return SOLID_SHOTS_DRIVER
  if (club === "3-Wood" || club === "5-Wood" || club === "7-Wood") return SOLID_SHOTS_WOOD
  return SOLID_SHOTS_IRON
}

/** Solid: at or above the power-analysis count. OK: 15 or more. Thin: fewer. */
export function badgeFor(club: Club, nShots: number): Badge {
  if (nShots >= solidShotsFor(club)) return "solid"
  return nShots >= THIN_BELOW ? "ok" : "thin"
}

export interface ClubFit {
  club: Club
  profile: FittedProfile
  nShots: number
  sessionsUsed: number
  /** The club has no outdoor-grass shots: it is fitted only from mat or indoor data. */
  matIndoorOnly: boolean
}

// ---- fitting ----

const DAY_MS = 86_400_000

export function recencyWeight(ageDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / RECENCY_HALF_LIFE_DAYS)
}

function ageDays(date: string | null | undefined, now: Date): number {
  if (!date) return 0
  const t = Date.parse(date.length === 10 ? `${date}T12:00:00Z` : date)
  return Number.isFinite(t) ? (now.getTime() - t) / DAY_MS : 0
}

const isRealConditions = (s: Pick<SessionMeta, "environment" | "surface">) => s.environment === "outdoor" && s.surface === "grass"

/**
 * Fits one profile per club from the golfer's saved shots. Excluded sessions and
 * partial swings are left out. Each shot is weighted by how recent its session
 * is, and, for a club that has some outdoor-grass shots, mat and indoor shots
 * count for less.
 */
export function fitProfiles(sessions: SessionMeta[], shots: StoredShot[], now: Date = new Date()): ClubFit[] {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const perClub = new Map<Club, { shot: StoredShot; session: SessionMeta | null }[]>()
  for (const shot of shots) {
    if (shot.isPartial) continue
    const session = shot.sessionId ? byId.get(shot.sessionId) ?? null : null
    if (session?.excluded) continue
    const list = perClub.get(shot.club)
    if (list) list.push({ shot, session })
    else perClub.set(shot.club, [{ shot, session }])
  }

  const fits: ClubFit[] = []
  for (const club of BAG_ORDER) {
    const rows = perClub.get(club)
    if (!rows || rows.length < MIN_FIT_SHOTS) continue
    // A shot with no session (legacy) is taken as real-conditions: it has nothing saying otherwise.
    const real = (r: (typeof rows)[number]) => (r.session ? isRealConditions(r.session) : true)
    const hasReal = rows.some(real)
    const fitShots: FitShot[] = rows.map((r) => ({
      club,
      carryYds: r.shot.carryYds,
      offlineYds: r.shot.offlineYds,
      launchDirDeg: r.shot.launchDirDeg,
      curveYds: r.shot.curveYds,
      weight: recencyWeight(ageDays(r.session?.date ?? r.shot.date, now)) * (hasReal && !real(r) ? MAT_INDOOR_WEIGHT : 1),
    }))
    const profile = calibrate(fitShots, MIN_FIT_SHOTS)[club]
    if (!profile) continue
    fits.push({
      club,
      profile,
      nShots: rows.length,
      sessionsUsed: new Set(rows.map((r) => r.shot.sessionId ?? "legacy")).size,
      matIndoorOnly: !hasReal,
    })
  }
  return fits
}

// ---- stored form (shot_profiles rows) ----

export type StoredParams = FittedProfile & { mat_indoor_only?: boolean }

export interface ProfileRow {
  club: string
  params: StoredParams
  n_shots: number
  sessions_used: number
  fitted_at?: string
}

export function fitToRow(f: ClubFit): ProfileRow {
  return { club: f.club, params: { ...f.profile, mat_indoor_only: f.matIndoorOnly }, n_shots: f.nShots, sessions_used: f.sessionsUsed }
}

/** Reads a stored row back, or null when it isn't a usable profile. */
export function fitFromRow(row: ProfileRow): ClubFit | null {
  const club = (BAG_ORDER as readonly string[]).includes(row.club) ? (row.club as Club) : null
  const p = row.params
  if (!club || !p || ![p.mean_carry, p.distance_cv, p.start_line_sd_deg, p.curve_sd_pct].every(Number.isFinite)) return null
  const { mat_indoor_only, ...profile } = p
  return { club, profile, nShots: row.n_shots, sessionsUsed: row.sessions_used, matIndoorOnly: mat_indoor_only === true }
}

// ---- summaries for the shot-data page ----

export interface ClubSummary {
  club: Club
  n: number
  meanCarry: number
  carrySd: number
  startLineBias: number | null
  offlineSd: number
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length
const sd = (x: number[]) => {
  if (x.length < 2) return 0
  const m = mean(x)
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1))
}

/** Plain (unweighted) numbers over the shots that count, for the page's per-club table. */
export function summarizeClubs(sessions: SessionMeta[], shots: StoredShot[]): ClubSummary[] {
  const excluded = new Set(sessions.filter((s) => s.excluded).map((s) => s.id))
  const by = new Map<Club, StoredShot[]>()
  for (const s of shots) {
    if (s.isPartial || (s.sessionId && excluded.has(s.sessionId))) continue
    by.set(s.club, [...(by.get(s.club) ?? []), s])
  }
  return BAG_ORDER.flatMap((club) => {
    const list = by.get(club)
    if (!list) return []
    const launch = list.map((s) => s.launchDirDeg).filter((v): v is number => v != null)
    return [
      {
        club,
        n: list.length,
        meanCarry: mean(list.map((s) => s.carryYds)),
        carrySd: sd(list.map((s) => s.carryYds)),
        startLineBias: launch.length === list.length ? mean(launch) : null,
        offlineSd: sd(list.map((s) => s.offlineYds)),
      },
    ]
  })
}

// ---- the planner's bag ----

export type ClubBasis = "fitted" | "blended" | "estimated"

function toFittedClubProfile(p: FittedProfile): FittedClubProfile {
  return {
    mean_carry: p.mean_carry,
    distance_cv: p.distance_cv,
    start_line_bias_deg: p.start_line_bias_deg,
    start_line_sd_deg: p.start_line_sd_deg,
    curve_bias_pct: p.curve_bias_pct,
    curve_sd_pct: p.curve_sd_pct,
    curve_carry_slope: p.curve_carry_slope,
  }
}

/**
 * A thin club's profile: the fitted one blended with the handicap profile
 * anchored to the golfer's own mean carry for that club. The golfer's shots
 * weigh n / THIN_BELOW, the handicap profile the rest. Mean carry stays the
 * golfer's (the anchor); biases shrink toward zero, the curve slope toward the default.
 */
export function blendThin(fit: ClubFit, handicapProfile: ClubProfile): FittedClubProfile {
  const w = Math.min(1, fit.nShots / THIN_BELOW)
  const f = fit.profile
  const share = CLUB_CURVE_SHARE[fit.club] ?? 0.5
  const totalSdRad = (handicapProfile.direction_sd_deg * Math.PI) / 180
  const hStartSd = (totalSdRad * Math.sqrt(1 - share) * 180) / Math.PI
  const hCurveSd = totalSdRad * Math.sqrt(share)
  const mix = (mine: number, theirs: number) => w * mine + (1 - w) * theirs
  return {
    mean_carry: f.mean_carry,
    distance_cv: mix(f.distance_cv, handicapProfile.distance_cv),
    start_line_bias_deg: mix(f.start_line_bias_deg, 0),
    start_line_sd_deg: mix(f.start_line_sd_deg, hStartSd),
    curve_bias_pct: mix(f.curve_bias_pct, 0),
    curve_sd_pct: mix(f.curve_sd_pct, hCurveSd),
    curve_carry_slope: mix(f.curve_carry_slope, DEFAULT_CURVE_CARRY_SLOPE),
  }
}

export interface MyBag {
  clubs: { club: string; shots: { carryYds: number; offlineYds: number }[] }[]
  basis: Record<string, ClubBasis>
  /** Plain-language note for every club that is not a straight fit. */
  notes: Record<string, string>
}

/**
 * The planner's shots for a bag: fitted clubs from the golfer's profile, thin
 * clubs blended with their handicap profile (marked "est."), and clubs with no
 * data from the handicap profile scaled to the golfer's carries. Reproducible
 * from the seed; each club's seed depends only on the club, so changing the bag
 * never changes another club's shots.
 */
export function generateMyBag(
  fits: ClubFit[],
  bag: readonly Club[],
  handicapIndex: number,
  perClub: number = MY_SHOTS_PER_CLUB,
  seed: number = MY_SHOTS_SEED
): MyBag {
  const byClub = new Map(fits.map((f) => [f.club, f]))
  const knownCarries: Partial<Record<Club, number>> = {}
  for (const f of fits) knownCarries[f.club] = f.profile.mean_carry
  const anchored = scaleProfilesToCarries(profilesForHandicap(handicapIndex), knownCarries)

  const clubs: MyBag["clubs"] = []
  const basis: Record<string, ClubBasis> = {}
  const notes: Record<string, string> = {}
  for (const club of BAG_ORDER) {
    if (!bag.includes(club)) continue
    const clubSeed = seed + BAG_ORDER.indexOf(club) * 101
    const fit = byClub.get(club)
    if (fit && fit.nShots >= THIN_BELOW) {
      basis[club] = "fitted"
      clubs.push(...generateFromFittedProfile({ [club]: toFittedClubProfile(fit.profile) }, perClub, clubSeed))
    } else if (fit) {
      basis[club] = "blended"
      notes[club] = `Only ${fit.nShots} ${club} shot${fit.nShots === 1 ? "" : "s"} on record: your numbers blended with a handicap-${Math.round(handicapIndex)} golfer's`
      clubs.push(...generateFromFittedProfile({ [club]: blendThin(fit, anchored[club]) }, perClub, clubSeed))
    } else {
      basis[club] = "estimated"
      notes[club] = `No ${club} shots on record: estimated from a handicap-${Math.round(handicapIndex)} golfer scaled to your carries`
      const shots = generateCustomGolferShots({ handicapIndex, knownCarries }, perClub, clubSeed, [club])
      clubs.push({ club, shots: shots.map((s) => ({ carryYds: s.carryYds, offlineYds: s.offlineYds })) })
    }
  }
  return { clubs, basis, notes }
}
