// Shared set-up for the regression tests built from Dillon's real rounds: his
// fitted per-club profile (calibrate.py output, no raw shots) generates shots
// from a fixed seed, and the Colts Neck geometry for holes 3 and 6 is a fixture
// (OpenStreetMap data, ODbL; see the fixture's _attribution). No Supabase.

import fixture from "./__fixtures__/colts-neck-3-6.json"
import profileFile from "@/lib/golfer/__fixtures__/dillon-fitted-profile.json"
import { fillBag, CALIBRATED_DEFAULT_BAG, canonicalClub } from "@/lib/golfer/bag"
import { generateFromFittedProfile, type FittedProfile } from "@/lib/golfer/fitted"
import { getBaseline } from "./baseline"
import { assessHoleDataQuality, estimatedFairwayCorridor } from "./dataQuality"
import { distanceYds, type LatLng } from "./geo"
import { buildLieMap, type UserZone } from "./lies"
import { buildLookahead } from "./lookahead"
import { obZonesFor, type ObTag } from "./obTags"
import type { CourseFeature, CourseHole } from "./overpass"
import type { ClubShots, OptimizedClubPlan } from "./plan"
import { parPick, rankBothStrategies } from "./rankStrategies"
import { needsLookahead, ON_COURSE_SPREAD, penaltyShare } from "./strategy"
import { holePinFor } from "@/lib/planner/geometry"

/** Handicap the regression cases are scored against (Dillon's tracked index is about 3). */
export const TEST_HANDICAP = 3

export function dillonBag(perClub = 1000, seed = 7): ClubShots[] {
  const generated = generateFromFittedProfile(profileFile.profile as FittedProfile, perClub, seed)
  const measured = generated.flatMap((g) => (canonicalClub(g.club) ? [{ club: g.club, shots: g.shots }] : []))
  return fillBag(measured, CALIBRATED_DEFAULT_BAG).map((c) => ({ club: c.club, shots: c.shots }))
}

export function coltsNeckHole(ref: number) {
  const hole = (fixture.holes as unknown as CourseHole[]).find((h) => h.ref === ref) as CourseHole
  const features = fixture.features as unknown as CourseFeature[]
  const pin = holePinFor(hole, features)
  return { hole, features, pin, par: hole.par ?? 4, yards: Math.round(distanceYds(hole.line[0], pin)) }
}

export interface Case {
  ranking: ReturnType<typeof rankBothStrategies>
  pickPar: OptimizedClubPlan | undefined
  go: OptimizedClubPlan | undefined
  ms: number
}

/** Rank the bag from the tee of a Colts Neck hole, as the planner does (estimated fairway corridor, OB tags as zones). */
export function rankColtsNeck(ref: number, tags: ObTag[], opts: { spread?: number; clubs?: ClubShots[]; lookahead?: boolean } = {}): Case {
  const { hole, features, pin, par, yards } = coltsNeckHole(ref)
  const quality = assessHoleDataQuality(hole, features, [])
  const corridor = quality.fairway === "estimated" ? [estimatedFairwayCorridor(hole, pin)] : []
  const zones: UserZone[] = obZonesFor(hole.line, features, tags)
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
  const useLook = opts.lookahead ?? needsLookahead(par, yards)
  const ranking = rankBothStrategies(opts.clubs ?? dillonBag(), { from, aim: pin, pin, lies, startLie: "tee", baseline }, {
    spread: opts.spread ?? ON_COURSE_SPREAD,
    line: hole.line,
    lookahead: useLook ? (strategy, clubs) => buildLookahead({ clubs, strategy, from, pin, line: hole.line, lies, baseline }) : undefined,
  })
  const ms = performance.now() - t0
  return { ranking, pickPar: parPick(ranking.par)?.chosen, go: ranking.go[0], ms }
}

export function table(rows: OptimizedClubPlan[]): string {
  return rows
    .map((r) => {
      const left = r.plan.meanTotalYds
      return `${r.club.padEnd(8)} total ${left.toFixed(0).padStart(3)}  strokes ${r.plan.expectedStrokes.toFixed(3)}  pen ${(penaltyShare(r.plan) * 100).toFixed(1).padStart(4)}% (oob ${(r.plan.lieShare.oob * 100).toFixed(1)} water ${(r.plan.lieShare.water * 100).toFixed(1)})  aim ${r.offsetYds.toFixed(0)}`
    })
    .join("\n")
}
