import { describe, expect, it } from "vitest"
import { fromLocal, toLocal, type LatLng } from "./geo"
import { buildElevationField, elevationAt, holeSamplePoints, samePoints, ELEVATION_MAX_POINTS, type ElevationField, type ElevationPoint } from "./elevation"
import {
  adjustShot,
  COLD_TIP_BELOW_F,
  conditionsKey,
  crosswindDriftYds,
  temperatureCarryShare,
  TEMP_CARRY_PER_10F,
  TEMP_MAX_CARRY_SHARE,
  ELEVATION_FT_PER_YD,
  HEADWIND_CARRY_PER_MPH,
  playsLike,
  playsLikeBreakdown,
  spinGroup,
  TAILWIND_CARRY_PER_MPH,
  windCarryShare,
  windComponents,
  type ShotConditions,
} from "./playsLike"
import { buildLieMap } from "./lies"
import { evaluateClub, simulateLandings, rankClubsOptimized, type ClubShots } from "./plan"
import { createRankHandler, rankKey, type LieInputs, type RankMessage } from "./rankRequest"
import { absoluteFromHole, clampTemperature, parseWindResponse, relativeToHole, resolveTemperature, resolveWind, windUrl, roundWind, MANUAL_WIND_MAX_AGE_MS, WIND_MAX_AGE_MS, WIND_REFRESH_MS } from "./wind"
import { parseAutoMap } from "./windStore"
import { parseEpqs, parseOpenMeteo } from "./elevationSources"
import { seededRng } from "@/lib/dispersion/stats"
import { baselineFromSessions, baselineTemperatureF, INDOOR_TEMP_F, parseSessionTemperature, withIndoorDefault } from "@/lib/shots/temperature"
import type { SessionMeta, StoredShot } from "@/lib/shots/types"
import { coltsNeckHole, rankColtsNeck, table } from "./regressionHarness"

const ORIGIN: LatLng = { lat: 40.3, lng: -74 }
const at = (x: number, y: number) => fromLocal(ORIGIN, { x, y })
const NORTH = 0 // aiming north

/** Ground that rises `ftPerYd` feet per yard heading north, over a wide patch around the origin. */
function slope(ftPerYd: number): ElevationField {
  const pts: ElevationPoint[] = []
  for (let y = -50; y <= 450; y += 25) for (const x of [-60, 0, 60]) pts.push({ ...at(x, y), ft: 100 + ftPerYd * y })
  return buildElevationField(pts) as ElevationField
}

const flat = (): ElevationField => slope(0)
const wind = (speedMph: number, fromDeg: number): ShotConditions => ({ wind: { speedMph, fromDeg }, elevation: null, temperatureF: null })

describe("elevation field", () => {
  it("reads back the heights it was built from, and interpolates between them", () => {
    const f = slope(0.5)
    expect(elevationAt(f, at(0, 100))).toBeCloseTo(150, 0)
    expect(elevationAt(f, at(0, 200))).toBeCloseTo(200, 0)
    // Between points it is an interpolation: within a foot of the true plane (a third of a yard of carry).
    expect(Math.abs((elevationAt(f, at(0, 137)) as number) - 168.5)).toBeLessThan(1)
  })

  it("has no opinion far from where it was sampled", () => {
    expect(elevationAt(slope(0.5), at(2000, 100))).toBeNull()
  })

  it("samples a hole at most ELEVATION_MAX_POINTS points, tee and green included, the same every time", () => {
    const line = [at(0, 0), at(10, 200), at(0, 560)]
    const pts = holeSamplePoints(line)
    expect(pts.length).toBeLessThanOrEqual(ELEVATION_MAX_POINTS)
    expect(pts.length).toBeGreaterThanOrEqual(6)
    expect(pts[0]).toEqual(line[0])
    expect(samePoints(pts, holeSamplePoints(line))).toBe(true)
    expect(samePoints(pts, holeSamplePoints([at(0, 0), at(0, 300)]))).toBe(false)
    // The last station sits on the green end.
    const last = pts[pts.length - 3]
    expect(Math.hypot(toLocal(line[2], last).x, toLocal(line[2], last).y)).toBeLessThan(1)
  })

  it("needs at least three usable points", () => {
    expect(buildElevationField([{ ...at(0, 0), ft: 1 }, { ...at(0, 10), ft: 2 }])).toBeNull()
  })
})

describe("wind components", () => {
  it("wind from the target is a headwind, from behind is a tailwind", () => {
    expect(windComponents({ speedMph: 10, fromDeg: 0 }, NORTH).headMph).toBeCloseTo(10)
    expect(windComponents({ speedMph: 10, fromDeg: 180 }, NORTH).headMph).toBeCloseTo(-10)
    expect(windComponents({ speedMph: 10, fromDeg: 180 }, NORTH).crossRightMph).toBeCloseTo(0, 6)
  })

  it("wind from the left pushes right (positive), from the right pushes left", () => {
    expect(windComponents({ speedMph: 10, fromDeg: 270 }, NORTH).crossRightMph).toBeCloseTo(10)
    expect(windComponents({ speedMph: 10, fromDeg: 90 }, NORTH).crossRightMph).toBeCloseTo(-10)
  })

  it("follows the shot's own direction, not north", () => {
    // Aiming east, a wind from the east is a headwind.
    expect(windComponents({ speedMph: 8, fromDeg: 90 }, 90).headMph).toBeCloseTo(8)
  })
})

describe("wind carry and drift", () => {
  it("a headwind costs more carry than the same tailwind adds", () => {
    const head = windCarryShare("7-Iron", 15)
    const tail = windCarryShare("7-Iron", -15)
    expect(head).toBeGreaterThan(0)
    expect(tail).toBeLessThan(0)
    expect(head).toBeGreaterThan(Math.abs(tail))
    expect(head).toBeCloseTo(15 * HEADWIND_CARRY_PER_MPH)
    expect(Math.abs(tail)).toBeCloseTo(15 * TAILWIND_CARRY_PER_MPH)
  })

  it("the same holds for a whole shot: into the wind loses more yards than downwind gains", () => {
    const into = adjustShot("7-Iron", 150, 0, at(0, 0), NORTH, wind(15, 0))
    const behind = adjustShot("7-Iron", 150, 0, at(0, 0), NORTH, wind(15, 180))
    expect(150 - into.carryYds).toBeGreaterThan(behind.carryYds - 150)
    expect(into.carryYds).toBeLessThan(150)
    expect(behind.carryYds).toBeGreaterThan(150)
  })

  it("wedges feel the wind more than drivers", () => {
    expect(windCarryShare("PW", 10)).toBeGreaterThan(windCarryShare("7-Iron", 10))
    expect(windCarryShare("7-Iron", 10)).toBeGreaterThan(windCarryShare("Driver", 10))
    expect(["Driver", "3-Wood", "Hybrid", "7-Iron", "PW", "LW"].map(spinGroup)).toEqual(["driver", "wood", "wood", "iron", "wedge", "wedge"])
  })

  it("a crosswind from the left moves the shot right, from the right moves it left, in proportion to carry and speed", () => {
    const fromLeft = adjustShot("7-Iron", 150, 0, at(0, 0), NORTH, wind(10, 270))
    const fromRight = adjustShot("7-Iron", 150, 0, at(0, 0), NORTH, wind(10, 90))
    expect(fromLeft.offlineYds).toBeGreaterThan(0)
    expect(fromRight.offlineYds).toBeCloseTo(-fromLeft.offlineYds)
    expect(crosswindDriftYds("7-Iron", 200, 10)).toBeCloseTo(2 * crosswindDriftYds("7-Iron", 100, 10))
    expect(crosswindDriftYds("7-Iron", 150, 20)).toBeCloseTo(2 * crosswindDriftYds("7-Iron", 150, 10))
  })

  it("never changes a carry by more than the cap, at any speed", () => {
    expect(windCarryShare("PW", 200)).toBeLessThanOrEqual(0.4)
    expect(windCarryShare("PW", -200)).toBeGreaterThanOrEqual(-0.4)
  })
})

describe("elevation changes the carry", () => {
  it("downhill carries farther, uphill carries shorter, about 1 yd per 3 ft", () => {
    // Heading north on ground rising 0.5 ft/yd, a shot that lands near 129 yd is 64 ft higher: it gives up about 21 yd.
    const rising: ShotConditions = { wind: null, elevation: slope(0.5), temperatureF: null }
    const uphill = adjustShot("7-Iron", 150, 0, at(0, 0), NORTH, rising)
    expect(uphill.carryYds).toBeGreaterThan(127.5)
    expect(uphill.carryYds).toBeLessThan(130)
    // The same ground, aimed back down it (south): the ball lands lower and carries farther.
    const downhill = adjustShot("7-Iron", 150, 0, at(0, 300), 180, rising)
    expect(downhill.carryYds).toBeGreaterThan(177)
    expect(downhill.carryYds).toBeLessThan(181)
    // Level ground changes nothing.
    expect(adjustShot("7-Iron", 150, 0, at(0, 0), NORTH, { wind: null, elevation: flat(), temperatureF: null }).carryYds).toBe(150)
  })

  it("rolls less uphill and into the wind, more downhill and downwind", () => {
    const rising: ShotConditions = { wind: null, elevation: slope(0.5), temperatureF: null }
    const uphill = adjustShot("Driver", 250, 0, at(0, 0), NORTH, rising)
    const downhill = adjustShot("Driver", 250, 0, at(0, 400), 180, rising)
    expect(uphill.rollScale).toBeLessThan(1)
    expect(downhill.rollScale).toBeGreaterThan(1)
    expect(adjustShot("Driver", 250, 0, at(0, 0), NORTH, wind(15, 0)).rollScale).toBeLessThan(1)
    expect(adjustShot("Driver", 250, 0, at(0, 0), NORTH, wind(15, 180)).rollScale).toBeGreaterThan(1)
    // A club that doesn't roll keeps a scale of 1.
    expect(adjustShot("7-Iron", 150, 0, at(0, 0), NORTH, wind(15, 180)).rollScale).toBe(1)
  })
})

describe("zero wind on flat ground reproduces the plain simulation exactly", () => {
  const lies = buildLieMap(ORIGIN, [{ kind: "fairway", ring: [at(-30, 0), at(30, 0), at(30, 420), at(-30, 420)] as LatLng[] }], [], [])
  const cloud = (mean: number, sd: number, n: number): ClubShots["shots"] => {
    const rng = seededRng(3)
    const out: ClubShots["shots"] = []
    for (let i = 0; i < n; i++) {
      const g = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng())
      out.push({ carryYds: mean + sd * g(), offlineYds: 6 * g() })
    }
    return out
  }
  const driver = cloud(255, 12, 300)

  it("with calm air and level ground every landing is identical", () => {
    const plain = simulateLandings("Driver", driver, at(0, 0), 3, lies)
    for (const c of [null, undefined, { wind: null, elevation: null }, { wind: { speedMph: 0, fromDeg: 90 }, elevation: null }, { wind: null, elevation: flat() }] as (ShotConditions | null | undefined)[]) {
      const with0 = simulateLandings("Driver", driver, at(0, 0), 3, lies, undefined, c)
      expect(with0).toEqual(plain)
    }
  })

  it("so an evaluated plan is identical", () => {
    const ctx = { from: at(0, 0), aim: at(0, 400), pin: at(0, 420), lies, startLie: "tee" as const }
    const a = evaluateClub({ club: "Driver", shots: driver }, ctx)
    const b = evaluateClub({ club: "Driver", shots: driver }, { ...ctx, conditions: { wind: { speedMph: 0, fromDeg: 0 }, elevation: flat(), temperatureF: null } })
    expect(b).toEqual(a)
  })

  it("and a real wind shows up in where the shots finish", () => {
    const ctx = { from: at(0, 0), aim: at(0, 400), pin: at(0, 420), lies, startLie: "tee" as const }
    const calm = evaluateClub({ club: "Driver", shots: driver }, ctx)
    const into = evaluateClub({ club: "Driver", shots: driver }, { ...ctx, conditions: wind(20, 0) })
    const behind = evaluateClub({ club: "Driver", shots: driver }, { ...ctx, conditions: wind(20, 180) })
    expect(into.meanTotalYds).toBeLessThan(calm.meanTotalYds)
    expect(behind.meanTotalYds).toBeGreaterThan(calm.meanTotalYds)
    expect(into.meanCarryYds).toBeLessThan(calm.meanCarryYds)
  })

  it("a crosswind from the left moves the whole pattern right", () => {
    const calm = simulateLandings("7-Iron", cloud(150, 6, 300), at(0, 0), NORTH, lies)
    const leftWind = simulateLandings("7-Iron", cloud(150, 6, 300), at(0, 0), NORTH, lies, undefined, wind(15, 270))
    const meanX = (ls: typeof calm) => ls.reduce((a, l) => a + toLocal(ORIGIN, l.point).x, 0) / ls.length
    expect(meanX(leftWind)).toBeGreaterThan(meanX(calm) + 3)
  })
})

describe("the ranking sees plays-like", () => {
  const lies = buildLieMap(ORIGIN, [{ kind: "fairway", ring: [at(-40, 0), at(40, 0), at(40, 450), at(-40, 450)] as LatLng[] }], [], [])
  const shots = (mean: number): ClubShots["shots"] => Array.from({ length: 80 }, (_, i) => ({ carryYds: mean + ((i % 9) - 4), offlineYds: (i % 7) - 3 }))
  const bag: ClubShots[] = [
    { club: "7-Iron", shots: shots(150) },
    { club: "8-Iron", shots: shots(138) },
    { club: "6-Iron", shots: shots(162) },
  ]
  const ctx = { from: at(0, 0), aim: at(0, 150), pin: at(0, 150), lies, startLie: "fairway" as const }

  it("a strong headwind changes which club is best into the green", () => {
    const calm = rankClubsOptimized(bag, ctx, { line: [at(0, 0), at(0, 150)] })[0].club
    const into = rankClubsOptimized(bag, { ...ctx, conditions: wind(20, 0) }, { line: [at(0, 0), at(0, 150)] })[0].club
    expect(calm).toBe("7-Iron")
    expect(into).toBe("6-Iron")
  })

  it("the worker takes the conditions, and they are part of what a ranking is keyed on", () => {
    const inputs: LieInputs = { origin: ORIGIN, features: [{ kind: "fairway", ring: [at(-40, 0), at(40, 0), at(40, 450), at(-40, 450)] as LatLng[] }], coast: [], zones: [], extras: {} }
    const msg = (conditions: ShotConditions | null): RankMessage => ({
      type: "rank", id: 1, liesVersion: 1, bagVersion: 1, from: at(0, 0), aim: at(0, 150), pin: at(0, 150), startLie: "fairway", line: [at(0, 0), at(0, 150)], handicap: 3, spread: 1.25, par: 4, yards: 150, conditions,
    })
    const handle = createRankHandler()
    handle({ type: "lies", version: 1, inputs })
    handle({ type: "bag", version: 1, clubs: bag })
    const calm = handle(msg(null))!.results![0].club
    const into = handle(msg(wind(20, 0)))!.results![0].club
    expect(calm).not.toBe(into)
    const k = { liesVersion: 1, bagVersion: 1, holeId: "h", startLie: "tee" as const, from: at(0, 0), pin: at(0, 400) }
    expect(rankKey({ ...k, conditionsKey: conditionsKey(wind(10, 0)) })).not.toBe(rankKey({ ...k, conditionsKey: conditionsKey(wind(11, 0)) }))
    expect(conditionsKey(null)).toBe(conditionsKey({ wind: null, elevation: null, temperatureF: null }))
  })
})

describe("the card's plays-like number", () => {
  it("downhill and a helping wind shorten it, and the breakdown says so", () => {
    const f = slope(-0.1) // falls 0.1 ft/yd heading north: 300 yd is 30 ft down
    const p = playsLike(300, at(0, 0), at(0, 300), NORTH, "7-Iron", { wind: { speedMph: 8, fromDeg: 180 }, elevation: f, temperatureF: null })!
    expect(p.elevationYds).toBeCloseTo(-10, 0)
    expect(p.windYds).toBeLessThan(0)
    expect(p.playsYds).toBeLessThan(300)
    expect(p.playsYds).toBeCloseTo(300 + p.elevationYds + p.windYds, 6)
    expect(playsLikeBreakdown(p)).toMatch(/^-10 downhill, -\d+ wind helping/)
  })

  it("is the inverse of the simulation: the plays-like carry, flown in those conditions, covers the distance", () => {
    const f = slope(0.2)
    const c: ShotConditions = { wind: { speedMph: 12, fromDeg: 0 }, elevation: f, temperatureF: null }
    const p = playsLike(150, at(0, 0), at(0, 150), NORTH, "7-Iron", c)!
    const flown = adjustShot("7-Iron", p.playsYds, 0, at(0, 0), NORTH, c)
    expect(flown.carryYds).toBeGreaterThan(145)
    expect(flown.carryYds).toBeLessThan(155)
  })

  it("is null with nothing to adjust", () => {
    expect(playsLike(150, at(0, 0), at(0, 150), NORTH, "7-Iron", null)).toBeNull()
    expect(playsLike(150, at(0, 0), at(0, 150), NORTH, "7-Iron", wind(0, 0))).toBeNull()
  })
})

describe("wind readings, manual override and offline", () => {
  const NOW = 1_800_000_000_000
  const auto = { speedMph: 9, fromDeg: 290, at: NOW - 5 * 60_000, temperatureF: null }

  it("parses an Open-Meteo answer and rounds it", () => {
    const r = parseWindResponse({ current: { wind_speed_10m: 9.4, wind_direction_10m: 292 } }, NOW)!
    expect(r).toEqual({ speedMph: 9, fromDeg: 290, at: NOW, temperatureF: null })
    expect(parseWindResponse({ current: {} }, NOW)).toBeNull()
    expect(parseWindResponse(null, NOW)).toBeNull()
    expect(roundWind({ speedMph: 4.6, fromDeg: 359 })).toEqual({ speedMph: 5, fromDeg: 0 })
  })

  it("manual always wins over a fresh automatic reading", () => {
    const manual = { speedMph: 20, fromDeg: 90, at: NOW - 60_000 }
    const r = resolveWind(manual, auto, NOW, false)
    expect(r.source).toBe("manual")
    expect(r.wind).toEqual({ speedMph: 20, fromDeg: 90 })
  })

  it("offline: the last reading is used and labelled with its time", () => {
    const r = resolveWind(null, auto, NOW, true)
    expect(r.source).toBe("auto")
    expect(r.wind).toEqual({ speedMph: 9, fromDeg: 290 })
    expect(r.at).toBe(auto.at)
    expect(r.labelTime).toBe(true)
    // With signal and a fresh reading there's no need to show the time.
    expect(resolveWind(null, auto, NOW, false).labelTime).toBe(false)
    // A reading two refreshes old is labelled even though the last refresh didn't fail.
    expect(resolveWind(null, { ...auto, at: NOW - 3 * WIND_REFRESH_MS }, NOW, false).labelTime).toBe(true)
  })

  it("a lapsed manual setting or a day-old reading is not used", () => {
    expect(resolveWind({ speedMph: 20, fromDeg: 90, at: NOW - MANUAL_WIND_MAX_AGE_MS - 1 }, auto, NOW, false).source).toBe("auto")
    expect(resolveWind(null, { ...auto, at: NOW - WIND_MAX_AGE_MS - 1 }, NOW, true)).toMatchObject({ source: "none", wind: null })
  })

  it("the saved readings drop old and malformed entries", () => {
    const raw = JSON.stringify({ a: auto, b: { ...auto, at: NOW - WIND_MAX_AGE_MS - 1 }, c: { speedMph: "x" } })
    expect(Object.keys(parseAutoMap(raw, NOW))).toEqual(["a"])
    expect(parseAutoMap("not json", NOW)).toEqual({})
    expect(parseAutoMap(null, NOW)).toEqual({})
  })

  it("the dial's relative direction and the compass bearing convert back and forth", () => {
    expect(relativeToHole(0, 0)).toBe(0)
    expect(relativeToHole(90, 45)).toBe(45)
    expect(relativeToHole(10, 350)).toBe(20)
    expect(absoluteFromHole(relativeToHole(123, 77), 77)).toBe(123)
  })
})

describe("elevation services", () => {
  it("reads EPQS and treats its out-of-coverage answer as missing", () => {
    expect(parseEpqs({ value: 24.34 })).toBeCloseTo(24.34)
    expect(parseEpqs({ value: -1000000 })).toBeNull()
    expect(parseEpqs({})).toBeNull()
  })

  it("converts Open-Meteo metres to feet", () => {
    expect(parseOpenMeteo({ elevation: [10, 0] })![0]).toBeCloseTo(32.808, 2)
    expect(parseOpenMeteo({ elevation: [10, null] })).toBeNull()
  })
})

describe("Colts Neck regression cases with plays-like switched on but calm and level", () => {
  // Level ground sampled along the hole, and no wind: every number must match the plain ranking.
  const level = (ref: number): ShotConditions => {
    const { hole } = coltsNeckHole(ref)
    const pts = holeSamplePoints(hole.line).map((p) => ({ ...p, ft: 120 }))
    return { wind: { speedMph: 0, fromDeg: 270 }, elevation: buildElevationField(pts), temperatureF: null }
  }

  for (const ref of [3, 6]) {
    it(`hole ${ref}: the ranking, both options and the penalty shares are identical`, () => {
      const plain = rankColtsNeck(ref, [])
      const calm = rankColtsNeck(ref, [], { conditions: level(ref) })
      expect(table(calm.ranking)).toBe(table(plain.ranking))
      expect(calm.ranking.map((r) => [r.club, r.plan.expectedStrokes, r.plan.lieShare, r.offsetYds])).toEqual(plain.ranking.map((r) => [r.club, r.plan.expectedStrokes, r.plan.lieShare, r.offsetYds]))
      expect(calm.options.lowest.club).toBe(plain.options.lowest.club)
      expect(calm.options.safer.club).toBe(plain.options.safer.club)
    })
  }

  it("a real headwind on hole 3 shortens every club's finish (the look-ahead and the penalty shares use it too)", () => {
    const plain = rankColtsNeck(3, [])
    const into = rankColtsNeck(3, [], { conditions: { wind: { speedMph: 20, fromDeg: 0 }, elevation: null, temperatureF: null } })
    const driver = (c: typeof plain) => c.ranking.find((r) => r.club === "Driver")!.plan.meanCarryYds
    expect(driver(into)).toBeLessThan(driver(plain))
  })
})

describe("air temperature", () => {
  const temp = (temperatureF: number | null, baselineF = 70): ShotConditions => ({ wind: null, elevation: null, temperatureF, baselineF })
  const carry = (c: ShotConditions, yds = 150) => adjustShot("7-Iron", yds, 4, at(0, 0), NORTH, c)

  it("uses 1% of carry per 10 F, clamped to 6%", () => {
    expect(TEMP_CARRY_PER_10F).toBe(0.01)
    expect(TEMP_MAX_CARRY_SHARE).toBe(0.06)
  })

  it("40 F against a 70 F baseline takes about 3% off the carry; the offline miss is unchanged", () => {
    const r = carry(temp(40))
    expect(r.carryYds).toBeCloseTo(150 * 0.97, 6)
    expect(r.offlineYds).toBe(4)
  })

  it("95 F adds about 2.5% (symmetric: warmer = longer)", () => {
    expect(carry(temp(95)).carryYds).toBeCloseTo(150 * 1.025, 6)
    expect(temperatureCarryShare(50)).toBeCloseTo(-temperatureCarryShare(90), 12)
  })

  it("the same gap above and below an off-70 baseline gives the same share", () => {
    expect(temperatureCarryShare(60, 50)).toBeCloseTo(0.01, 12)
    expect(carry(temp(60, 50)).carryYds).toBeCloseTo(151.5, 6)
  })

  it("a temperature that matches the baseline (within 2 F) returns the shot untouched", () => {
    for (const t of [70, 71, 69, 71.9, null]) {
      expect(carry(temp(t))).toEqual({ carryYds: 150, offlineYds: 4, rollScale: 1 })
    }
    expect(carry(temp(72)).carryYds).toBeGreaterThan(150)
    expect(adjustShot("Driver", 250, 0, at(0, 0), NORTH, temp(70)).carryYds).toBe(250)
  })

  it("the effect is clamped to 6% however cold or hot it gets (-10 F)", () => {
    expect(carry(temp(-10)).carryYds).toBeCloseTo(150 * 0.94, 6)
    expect(temperatureCarryShare(-10)).toBe(-TEMP_MAX_CARRY_SHARE)
    expect(temperatureCarryShare(120)).toBeCloseTo(0.05, 12) // a 50 F gap: inside the clamp
    expect(temperatureCarryShare(150)).toBe(TEMP_MAX_CARRY_SHARE)
  })

  it("rollout is left alone", () => {
    expect(adjustShot("Driver", 250, 0, at(0, 0), NORTH, temp(30)).rollScale).toBe(1)
  })

  it("wind acts on the temperature-adjusted carry", () => {
    const c: ShotConditions = { wind: { speedMph: 10, fromDeg: 0 }, elevation: null, temperatureF: 40, baselineF: 70 }
    const share = windCarryShare("7-Iron", windComponents(c.wind, NORTH).headMph)
    expect(carry(c).carryYds).toBeCloseTo(150 * 0.97 * (1 - share), 6)
  })

  it("elevation acts on the temperature-adjusted carry", () => {
    const c: ShotConditions = { wind: null, elevation: slope(0), temperatureF: 40, baselineF: 70 }
    expect(adjustShot("7-Iron", 150, 0, at(0, 0), NORTH, c).carryYds).toBeCloseTo(150 * 0.97, 3)
  })

  it("no baseline given means 70 F", () => {
    expect(carry({ wind: null, elevation: null, temperatureF: 40 }).carryYds).toBeCloseTo(150 * 0.97, 6)
  })

  it("conditionsKey changes with the temperature and the baseline, and not for a matching one", () => {
    const k = (t: number | null, b = 70) => conditionsKey(temp(t, b))
    expect(k(40)).not.toBe(k(60))
    expect(k(40)).not.toBe(k(40, 60))
    expect(k(40)).not.toBe("-")
    expect(k(70)).toBe(conditionsKey(null))
    expect(k(null)).toBe(conditionsKey(null))
  })

  it("the card's breakdown says cold adds yards and warm takes them off, with the temperature", () => {
    const cold = playsLike(150, at(0, 0), at(0, 150), NORTH, "7-Iron", temp(48))!
    expect(cold.temperatureYds).toBeGreaterThan(0)
    expect(cold.playsYds).toBeCloseTo(150 / (1 - 0.022), 6)
    expect(playsLikeBreakdown(cold)).toBe("+3 cold (48°F)")
    const warm = playsLike(150, at(0, 0), at(0, 150), NORTH, "7-Iron", temp(88))!
    expect(playsLikeBreakdown(warm)).toBe("-3 warm (88°F)")
    expect(playsLike(150, at(0, 0), at(0, 150), NORTH, "7-Iron", temp(70))).toBeNull()
  })

  it("the card's plays-like distance is what adjustShot needs to cover it, with wind and temperature together", () => {
    const c: ShotConditions = { wind: { speedMph: 8, fromDeg: 0 }, elevation: null, temperatureF: 45, baselineF: 70 }
    const p = playsLike(150, at(0, 0), at(0, 150), NORTH, "7-Iron", c)!
    expect(adjustShot("7-Iron", p.playsYds, 0, at(0, 0), NORTH, c).carryYds).toBeCloseTo(150, 6)
    expect(p.playsYds).toBeCloseTo(150 + p.windYds + p.temperatureYds + p.elevationYds, 6)
  })

  it("the cold-day tip threshold is 45 F", () => {
    expect(COLD_TIP_BELOW_F).toBe(45)
  })

  it("the plain simulation is reproduced exactly at a matching temperature", () => {
    for (const ref of [3, 6]) {
      const plain = rankColtsNeck(ref, [])
      const same = rankColtsNeck(ref, [], { conditions: temp(70) })
      expect(table(same.ranking)).toBe(table(plain.ranking))
    }
  })

  it("a cold day shortens the simulated carry", () => {
    const plain = rankColtsNeck(3, [])
    const cold = rankColtsNeck(3, [], { conditions: temp(40) })
    const mean = (c: typeof plain) => c.ranking.find((r) => r.club === "7-Iron")!.plan.meanCarryYds
    expect(mean(cold)).toBeLessThan(mean(plain))
  })
})

describe("weather reading with temperature", () => {
  const NOW = 1_800_000_000_000
  it("asks Open-Meteo for the air temperature in F in the same request", () => {
    const u = windUrl(40.3, -74)
    expect(u).toContain("temperature_2m")
    expect(u).toContain("temperature_unit=fahrenheit")
    expect(u).toContain("wind_speed_10m")
  })

  it("parses and rounds the temperature; missing or silly values become null", () => {
    const ok = parseWindResponse({ current: { wind_speed_10m: 9.4, wind_direction_10m: 292, temperature_2m: 48.4 } }, NOW)!
    expect(ok.temperatureF).toBe(48)
    expect(parseWindResponse({ current: { wind_speed_10m: 9, wind_direction_10m: 292 } }, NOW)!.temperatureF).toBeNull()
    expect(parseWindResponse({ current: { wind_speed_10m: 9, wind_direction_10m: 292, temperature_2m: 900 } }, NOW)!.temperatureF).toBeNull()
  })

  it("a manual temperature wins; a stale or missing automatic one gives none", () => {
    const auto = { speedMph: 9, fromDeg: 290, at: NOW - 60_000, temperatureF: 55 }
    expect(resolveTemperature({ temperatureF: 80, at: NOW - 1000 }, auto, NOW)).toMatchObject({ temperatureF: 80, source: "manual" })
    expect(resolveTemperature(null, auto, NOW)).toMatchObject({ temperatureF: 55, source: "auto" })
    expect(resolveTemperature(null, { ...auto, temperatureF: null }, NOW)).toMatchObject({ temperatureF: null, source: "none" })
    expect(resolveTemperature(null, { ...auto, at: NOW - WIND_MAX_AGE_MS - 1 }, NOW).source).toBe("none")
    expect(resolveTemperature(null, null, NOW).temperatureF).toBeNull()
  })

  it("the temperature field stays within -20 to 120 F", () => {
    expect(clampTemperature(-50)).toBe(-20)
    expect(clampTemperature(200)).toBe(120)
    expect(clampTemperature(61.6)).toBe(62)
  })

  it("saved readings from before temperature existed load with no temperature", () => {
    const raw = JSON.stringify({ a: { speedMph: 9, fromDeg: 290, at: NOW }, b: { speedMph: 9, fromDeg: 290, at: NOW, temperatureF: 61 } })
    const m = parseAutoMap(raw, NOW)
    expect(m.a.temperatureF).toBeNull()
    expect(m.b.temperatureF).toBe(61)
  })
})

describe("the profile's baseline temperature", () => {
  it("is the shot-count-weighted average over sessions that have a temperature, ignoring those without", () => {
    const b = baselineTemperatureF([
      { temperatureF: 50, shotCount: 100 },
      { temperatureF: null, shotCount: 500 },
      { temperatureF: undefined, shotCount: 50 },
      { temperatureF: 80, shotCount: 300 },
    ])
    expect(b).toBeCloseTo((50 * 100 + 80 * 300) / 400, 9)
  })

  it("is 70 F when no session has a temperature", () => {
    expect(baselineTemperatureF([])).toBe(70)
    expect(baselineTemperatureF([{ temperatureF: null, shotCount: 40 }])).toBe(70)
    expect(baselineTemperatureF([{ temperatureF: 40, shotCount: 0 }])).toBe(70)
  })

  const session = (id: string, temperatureF: number | null | undefined, excluded = false): SessionMeta => ({ id, label: id, date: null, environment: "outdoor", surface: "grass", excluded, temperatureF })
  const shot = (sessionId: string | null, isPartial = false): StoredShot => ({ sessionId, club: "7-Iron", carryYds: 150, offlineYds: 0, curveYds: null, launchDirDeg: null, isPartial })
  const many = (id: string | null, n: number) => Array.from({ length: n }, () => shot(id))

  it("counts only included sessions and full swings, from the page's own data", () => {
    const sessions = [session("a", 50), session("b", null), session("c", 90, true), session("d", 80)]
    const shots = [...many("a", 10), ...many("b", 20), ...many("c", 50), ...many("d", 30), shot("d", true), shot(null)]
    expect(baselineFromSessions(sessions, shots)).toBeCloseTo((50 * 10 + 80 * 30) / 40, 9)
    expect(baselineFromSessions([session("b", null)], shots)).toBe(70)
  })

  it("indoor sessions default to 70 F, outdoor ones are left alone, a typed value is kept", () => {
    expect(INDOOR_TEMP_F).toBe(70)
    expect(withIndoorDefault({ environment: "indoor" as const, temperatureF: null }).temperatureF).toBe(70)
    expect(withIndoorDefault({ environment: "indoor" as const, temperatureF: 64 }).temperatureF).toBe(64)
    expect(withIndoorDefault({ environment: "outdoor" as const, temperatureF: null }).temperatureF).toBeNull()
  })

  it("the typed temperature accepts -20 to 120 and nothing else", () => {
    expect(parseSessionTemperature("")).toBeNull()
    expect(parseSessionTemperature("64")).toBe(64)
    expect(parseSessionTemperature("-20")).toBe(-20)
    expect(parseSessionTemperature("121")).toBeNull()
    expect(parseSessionTemperature("abc")).toBeNull()
  })
})
