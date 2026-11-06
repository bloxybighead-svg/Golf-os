// Shared set-up for the Colts Neck regression tests: a synthetic fitted per-club
// profile (calibrate.py output on generated shots, see make_synthetic_fixtures.py) generates shots
// from a fixed seed, and the Colts Neck geometry for holes 3 and 6 is a fixture
// (OpenStreetMap data, ODbL; see the fixture's _attribution). No Supabase.

import fixture from "./__fixtures__/colts-neck-3-6.json"
import zonesFile from "./__fixtures__/colts-neck-3-6-zones.json"
import profileFile from "@/lib/golfer/__fixtures__/synthetic-fitted-profile.json"
import { fillBag, CALIBRATED_DEFAULT_BAG, canonicalClub, DEFAULT_BAG } from "@/lib/golfer/bag"
import type { Club } from "@/lib/golfer/tables"
import { generateFromFittedProfile, type FittedProfile } from "@/lib/golfer/fitted"
import { getBaseline } from "./baseline"
import { assessHoleDataQuality, estimatedFairwayCorridor } from "./dataQuality"
import { bearingDeg, distanceYds, lineLengthYds, pointAlongLine, type LatLng } from "./geo"
import { buildElevationField } from "./elevation"
import pebbleFixture from "./__fixtures__/pebble-h1.json"
import { fullBagShots } from "@/lib/golfer/bagShots"
import { buildLieMap, type UserZone } from "./lies"
import { buildLookahead, longestTotalYds } from "./lookahead"
import { obZonesFor, type ObTag } from "./obTags"
import type { CourseFeature, CourseHole } from "./overpass"
import type { ClubShots, OptimizedClubPlan } from "./plan"
import { optionsFor, rankWithSpread } from "./rankOptions"
import { needsLookahead, ON_COURSE_SPREAD, penaltyShare, smartRule, type Options } from "./strategy"
import type { ShotConditions } from "./playsLike"
import { holePinFor } from "@/lib/planner/geometry"

/** Handicap the regression cases are scored against (the synthetic golfer is a 3-handicap). */
export const TEST_HANDICAP = 3

export function sampleBag(perClub = 1000, seed = 7): ClubShots[] {
  const generated = generateFromFittedProfile(profileFile.profile as FittedProfile, perClub, seed)
  const measured = generated.flatMap((g) => (canonicalClub(g.club) ? [{ club: g.club, shots: g.shots }] : []))
  return fillBag(measured, CALIBRATED_DEFAULT_BAG).map((c) => ({ club: c.club, shots: c.shots }))
}

export function coltsNeckHole(ref: number) {
  const hole = (fixture.holes as unknown as CourseHole[]).find((h) => h.ref === ref) as CourseHole
  const features = fixture.features as unknown as CourseFeature[]
  const pin = holePinFor(hole, features)
  return { hole, features, pin }
}

export interface Case {
  /** Every club at its own best aim, fewest expected strokes first (the spread applied, long holes look ahead). */
  ranking: OptimizedClubPlan[]
  /** Smart play (the default, `safer`) and Go for it (`lowest`). */
  options: Options<OptimizedClubPlan>
  ms: number
}

/** Rank the bag from the tee of a Colts Neck hole, as the planner does (estimated fairway corridor, OB tags as zones). */
export function rankColtsNeck(ref: number, tags: ObTag[], opts: { spread?: number; clubs?: ClubShots[]; lookahead?: boolean; conditions?: ShotConditions | null } = {}): Case {
  const { hole, features, pin } = coltsNeckHole(ref)
  // His own hand-drawn marks for these holes (fairways, trees, out of bounds): what the planner has when he plays there.
  const marks = zonesFile.zones as UserZone[]
  const quality = assessHoleDataQuality(hole, features, marks)
  const corridor = quality.fairway === "estimated" ? [estimatedFairwayCorridor(hole, pin)] : []
  const zones: UserZone[] = [...marks, ...obZonesFor(hole.line, features, tags)]
  const lies = buildLieMap(
    fixture.course as LatLng,
    [...features, ...corridor],
    fixture.coast as LatLng[][],
    zones,
    { boundary: fixture.boundary as never, lines: fixture.lines as never }
  )
  const baseline = getBaseline(TEST_HANDICAP)
  const from = hole.line[0]
  const t0 = performance.now()
  const bag = opts.clubs ?? sampleBag()
  const useLook = opts.lookahead ?? needsLookahead(distanceYds(from, pin), longestTotalYds(bag, "tee"))
  const ranking = rankWithSpread(bag, { from, aim: pin, pin, lies, startLie: "tee", baseline, conditions: opts.conditions }, {
    spread: opts.spread ?? ON_COURSE_SPREAD,
    line: hole.line,
    lookahead: useLook ? (clubs) => buildLookahead({ clubs, from, pin, line: hole.line, lies, baseline, conditions: opts.conditions }) : undefined,
  })
  const ms = performance.now() - t0
  return { ranking, options: optionsFor(ranking) as Options<OptimizedClubPlan>, ms }
}

export function table(rows: OptimizedClubPlan[]): string {
  return rows
    .map((r) => {
      const left = r.plan.meanTotalYds
      return `${r.club.padEnd(8)} total ${left.toFixed(0).padStart(3)}  strokes ${r.plan.expectedStrokes.toFixed(3)}  pen ${(penaltyShare(r.plan) * 100).toFixed(1).padStart(4)}% (oob ${(r.plan.lieShare.oob * 100).toFixed(1)} water ${(r.plan.lieShare.water * 100).toFixed(1)} trees ${(r.plan.lieShare.trees * 100).toFixed(1)})  aim ${r.offsetYds.toFixed(0)}`
    })
    .join("\n")
}

// ---- Pebble Beach hole 1 (the planner's demo course), live conditions ---------
// The fixture is the cached OpenStreetMap geometry trimmed to the area around hole 1 (ODbL, see its _attribution).
// The golfer is a handicap-estimate bag, and the conditions are built by hand to match a live card: an 11 mph
// headwind, 59 F against carries measured at 70 F, and 7 yd of climb (21 ft) from tee to green.

export function pebbleH1(handicap: number, opts: { live?: boolean; risk?: number; bag?: Club[]; lookahead?: boolean } = {}): Case & { toPin: number } {
  const live = opts.live ?? true
  const hole = pebbleFixture.hole as unknown as CourseHole
  const features = pebbleFixture.features as unknown as CourseFeature[]
  const pin = holePinFor(hole, features)
  const from = hole.line[0]
  const lies = buildLieMap(pebbleFixture.course as LatLng, features, pebbleFixture.coast as LatLng[][], [], {
    boundary: pebbleFixture.boundary as never,
    lines: pebbleFixture.lines as never,
  })
  const total = lineLengthYds(hole.line)
  const conditions: ShotConditions | null = live
    ? {
        wind: { speedMph: 11, fromDeg: bearingDeg(from, pin) },
        elevation: buildElevationField(Array.from({ length: 12 }, (_, i) => ({ ...pointAlongLine(hole.line, (total * i) / 11), ft: (21 * i) / 11 }))),
        temperatureF: 59,
        baselineF: 70,
      }
    : null
  const bag = fullBagShots({ myBag: null, handicap, typed: {}, bag: opts.bag ?? DEFAULT_BAG })
  const baseline = getBaseline(handicap)
  const toPin = distanceYds(from, pin)
  const t0 = performance.now()
  const ranking = rankWithSpread(bag, { from, aim: pin, pin, lies, startLie: "tee", baseline, conditions }, {
    spread: ON_COURSE_SPREAD,
    line: hole.line,
    smart: smartRule(opts.risk),
    lookahead: (opts.lookahead ?? true) && needsLookahead(toPin, longestTotalYds(bag, "tee"))
      ? (clubs) => buildLookahead({ clubs, from, pin, line: hole.line, lies, baseline, conditions })
      : undefined,
  })
  const ms = performance.now() - t0
  return { ranking, options: optionsFor(ranking, smartRule(opts.risk)) as Options<OptimizedClubPlan>, ms, toPin }
}
