import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import path from "path"
import { parseCsv } from "@/lib/shots/parseCsv"
import type { SessionMeta, StoredShot } from "@/lib/shots/types"
import fitted13b from "./__fixtures__/synthetic-fitted-profile.json"
import { normalizeClubName } from "./clubNames"
import { profilesForHandicap } from "./tables"
import {
  MAT_INDOOR_WEIGHT,
  RECENCY_HALF_LIFE_DAYS,
  badgeFor,
  blendThin,
  fitFromRow,
  fitProfiles,
  fitToRow,
  generateMyBag,
  recencyWeight,
  summarizeClubs,
  type ClubFit,
} from "./shotProfile"

const NOW = new Date("2026-10-01T12:00:00Z")
const session = (id: string, over: Partial<SessionMeta> = {}): SessionMeta => ({ id, label: id, date: "2026-10-01", environment: "outdoor", surface: "grass", excluded: false, ...over })
const mk = (sessionId: string, club: StoredShot["club"], carries: number[], offline = 0): StoredShot[] =>
  carries.map((carryYds, i) => ({ sessionId, club, carryYds, offlineYds: offline + (i % 3) - 1, curveYds: null, launchDirDeg: null, isPartial: false }))

describe("badges", () => {
  it("Solid at the power-analysis counts (35 iron / 140 driver), OK from 15, Thin below", () => {
    expect(badgeFor("7-Iron", 35)).toBe("solid")
    expect(badgeFor("7-Iron", 34)).toBe("ok")
    expect(badgeFor("7-Iron", 15)).toBe("ok")
    expect(badgeFor("7-Iron", 14)).toBe("thin")
    expect(badgeFor("Driver", 139)).toBe("ok")
    expect(badgeFor("Driver", 140)).toBe("solid")
  })
})

describe("recency and surface weighting", () => {
  it("halves a shot's weight every half-life", () => {
    expect(recencyWeight(0)).toBe(1)
    expect(recencyWeight(RECENCY_HALF_LIFE_DAYS)).toBeCloseTo(0.5, 10)
    expect(recencyWeight(2 * RECENCY_HALF_LIFE_DAYS)).toBeCloseTo(0.25, 10)
    expect(recencyWeight(-5)).toBe(1)
  })

  it("pulls the fit toward the newer session", () => {
    const sessions = [session("old", { date: "2025-10-01" }), session("new", { date: "2026-10-01" })]
    const shots = [...mk("old", "7-Iron", Array(10).fill(150)), ...mk("new", "7-Iron", Array(10).fill(160))]
    const fit = fitProfiles(sessions, shots, NOW)[0]
    expect(fit.profile.mean_carry).toBeGreaterThan(159) // the year-old 150s weigh ~1/16
    expect(fit.profile.mean_carry).toBeLessThan(160.1)
    expect(fit.nShots).toBe(20)
    expect(fit.sessionsUsed).toBe(2)
  })

  it("lets outdoor-grass data lead when a club has both, and says so when it has only mat/indoor", () => {
    const sessions = [session("grass"), session("mat", { environment: "indoor", surface: "mat" })]
    const both = fitProfiles(sessions, [...mk("grass", "7-Iron", Array(10).fill(150)), ...mk("mat", "7-Iron", Array(10).fill(170))], NOW)[0]
    const expected = (10 * 150 + 10 * MAT_INDOOR_WEIGHT * 170) / (10 + 10 * MAT_INDOOR_WEIGHT)
    expect(both.profile.mean_carry).toBeCloseTo(expected, 0)
    expect(both.matIndoorOnly).toBe(false)

    const matOnly = fitProfiles(sessions, mk("mat", "7-Iron", Array(10).fill(170)), NOW)[0]
    expect(matOnly.matIndoorOnly).toBe(true)
    expect(matOnly.profile.mean_carry).toBe(170) // no down-weighting when there is nothing to prefer
  })

  it("leaves out excluded sessions, partials, and clubs under 5 shots", () => {
    const sessions = [session("a"), session("b", { excluded: true })]
    const shots = [...mk("a", "7-Iron", [150, 151, 152, 153, 154]), ...mk("b", "7-Iron", Array(20).fill(100)), ...mk("a", "PW", [120, 121, 122, 123])]
    shots.push({ ...mk("a", "7-Iron", [60])[0], isPartial: true })
    const fits = fitProfiles(sessions, shots, NOW)
    expect(fits.map((f) => f.club)).toEqual(["7-Iron"])
    expect(fits[0].nShots).toBe(5)
    expect(fits[0].profile.mean_carry).toBeCloseTo(152, 0)
  })

  it("round-trips through a shot_profiles row", () => {
    const fit = fitProfiles([session("a")], mk("a", "7-Iron", [150, 151, 152, 153, 154, 155]), NOW)[0]
    expect(fitFromRow(fitToRow(fit))).toEqual(fit)
    expect(fitFromRow({ club: "Putter", params: fit.profile, n_shots: 9, sessions_used: 1 })).toBeNull()
  })

  it("summarizes the clubs that count", () => {
    const rows = summarizeClubs([session("a"), session("b", { excluded: true })], [...mk("a", "7-Iron", [150, 160]), ...mk("b", "7-Iron", [10])])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ club: "7-Iron", n: 2, meanCarry: 155 })
  })
})

describe("continuity with the committed synthetic profile", () => {
  it("fits the reference shots to the same profile 13b's regression tests use", () => {
    const rows = parseCsv(readFileSync(path.join(__dirname, "__fixtures__", "synthetic_shots.csv"), "utf8"))
    const col = (n: string) => rows[0].indexOf(n)
    const sessions = [session("ref", { date: "2026-10-01" })]
    const shots: StoredShot[] = rows
      .slice(1)
      .map((r) => ({ club: normalizeClubName(r[col("club")]), r }))
      .filter((x): x is { club: NonNullable<typeof x.club>; r: string[] } => x.club != null)
      .map(({ club, r }) => ({
        sessionId: "ref",
        club,
        carryYds: Number(r[col("carry_yds")]),
        offlineYds: Number(r[col("offline_yds")]),
        curveYds: Number(r[col("curve_yds")]),
        launchDirDeg: Number(r[col("launch_dir_deg")]),
        isPartial: r[col("is_partial")] === "True",
      }))
    const fits = fitProfiles(sessions, shots, NOW)
    const theirs = fitted13b.profile as Record<string, { mean_carry: number; start_line_sd_deg: number }>
    const byName: Record<string, string> = { SW: "56 (SW)", LW: "60 (LW)" }
    for (const f of fits) {
      const t = theirs[byName[f.club] ?? f.club]
      if (!t) continue // 13b's file drops clubs under 10 shots; this fit keeps 5+
      expect(Math.abs(f.profile.mean_carry - t.mean_carry), f.club).toBeLessThan(0.11)
      expect(Math.abs(f.profile.start_line_sd_deg - t.start_line_sd_deg), f.club).toBeLessThan(0.011)
    }
    expect(fits.find((f) => f.club === "Driver")?.nShots).toBe(159)
  })
})

describe("thin-club blending and the generated bag", () => {
  const fit = (club: ClubFit["club"], n: number, over: Partial<ClubFit["profile"]> = {}): ClubFit => ({
    club,
    nShots: n,
    sessionsUsed: 1,
    matIndoorOnly: false,
    profile: { mean_carry: 150, distance_cv: 0.02, direction_sd_deg: 2, start_line_bias_deg: 2, start_line_sd_deg: 1, curve_bias_pct: 0.02, curve_sd_pct: 0.01, curve_carry_slope: -0.6, n_shots: n, ...over },
  })
  const hcp = profilesForHandicap(10)["7-Iron"]

  it("weights the golfer's numbers by n / 15 and keeps their mean carry", () => {
    const half = blendThin(fit("7-Iron", 7.5 as number), hcp) // w = 0.5
    expect(half.mean_carry).toBe(150)
    expect(half.start_line_bias_deg).toBeCloseTo(1, 10) // half of their 2 deg, half of the handicap golfer's 0
    expect(half.distance_cv).toBeCloseTo((0.02 + hcp.distance_cv) / 2, 10)
    expect(half.curve_carry_slope).toBeCloseTo((-0.6 + -0.2) / 2, 10)
    const full = blendThin(fit("7-Iron", 15), hcp)
    expect(full.start_line_sd_deg).toBe(1)
    const one = blendThin(fit("7-Iron", 1), hcp)
    expect(one.distance_cv).toBeGreaterThan(hcp.distance_cv * 0.9) // almost all handicap
  })

  it("marks thin clubs and no-data clubs, leaves enough-data clubs alone", () => {
    const bag = generateMyBag([fit("7-Iron", 40), fit("8-Iron", 6)], ["7-Iron", "8-Iron", "9-Iron"], 10, 200)
    expect(bag.basis).toEqual({ "7-Iron": "fitted", "8-Iron": "blended", "9-Iron": "estimated" })
    expect(Object.keys(bag.notes).sort()).toEqual(["8-Iron", "9-Iron"])
    expect(bag.notes["8-Iron"]).toMatch(/Only 6 8-Iron shots/)
    expect(bag.clubs.map((c) => c.club)).toEqual(["7-Iron", "8-Iron", "9-Iron"])
    expect(bag.clubs.every((c) => c.shots.length === 200)).toBe(true)
  })

  it("the no-data club is scaled to the golfer's own carries", () => {
    const bag = generateMyBag([fit("7-Iron", 40, { mean_carry: 200 })], ["7-Iron", "PW"], 10, 500)
    const pw = bag.clubs.find((c) => c.club === "PW")!.shots
    const mean = pw.reduce((a, s) => a + s.carryYds, 0) / pw.length
    const unscaled = profilesForHandicap(10).PW.mean_carry
    expect(mean).toBeGreaterThan(unscaled * 1.1) // a 200-yd 7-iron golfer's PW is longer than a typical 10's
  })

  it("is deterministic for a fixed seed, and a club's shots don't depend on the rest of the bag", () => {
    const fits = [fit("7-Iron", 40), fit("PW", 40, { mean_carry: 110 })]
    const a = generateMyBag(fits, ["7-Iron", "PW"], 10, 100, 5)
    const b = generateMyBag(fits, ["7-Iron", "PW"], 10, 100, 5)
    expect(a).toEqual(b)
    const alone = generateMyBag(fits, ["PW"], 10, 100, 5)
    expect(alone.clubs[0].shots).toEqual(a.clubs.find((c) => c.club === "PW")!.shots)
    expect(generateMyBag(fits, ["7-Iron"], 10, 100, 6).clubs[0].shots).not.toEqual(a.clubs[0].shots)
  })

  it("fitted clubs reproduce the fitted mean carry", () => {
    const bag = generateMyBag([fit("7-Iron", 40, { mean_carry: 162.5, distance_cv: 0.031 })], ["7-Iron"], 10, 4000)
    const shots = bag.clubs[0].shots
    const mean = shots.reduce((a, s) => a + s.carryYds, 0) / shots.length
    expect(Math.abs(mean - 162.5)).toBeLessThan(1.5)
  })
})
