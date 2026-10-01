"use client"

// The Play planner's numbers: the golfer's shots, the hole's pin and aim, the
// lie map, the club ranking (each club at its own best aim, in a Web Worker --
// see components/simulator/useClubRanking.ts), the chosen club, its dots, rings
// and the map labels (moved verbatim from CourseMapClient.tsx).

import { useEffect, useMemo, useRef } from "react"
import { bearingDeg, distanceYds, type LatLng } from "@/lib/course/geo"
import { defaultTeeAim } from "@/lib/course/aim"
import type { StartLie } from "@/lib/course/cost"
import { applyConfirmedAbsent, assessHoleDataQuality, estimatedFairwayCorridor, type HoleDataQuality } from "@/lib/course/dataQuality"
import { buildValueGrid, deltaColor, dispersionRing } from "@/lib/course/heatmap"
import type { UserZone } from "@/lib/course/lies"
import type { CourseFeature, CourseGeometry, CourseHole } from "@/lib/course/overpass"
import { aimMarkerFor, evaluateClub, isAtBestAim, simulateLandings, strokesAtAim, type ClubShots, type OptimizedClubPlan } from "@/lib/course/plan"
import { buildLieMapFrom, type LieInputs } from "@/lib/course/rankRequest"
import { DEFAULT_BASELINE_HANDICAP, getBaseline, type CompareAgainst } from "@/lib/course/baseline"
import { seededSample } from "@/lib/dispersion/stats"
import { generateCustomGolferShots, type Tendency } from "@/lib/golfer/build"
import type { Club } from "@/lib/golfer/tables"
import { fillBag } from "@/lib/golfer/bag"
import type { Baseline } from "@/lib/golfer/baseline"
import { ALWAYS_SHOWN, LIES } from "@/lib/planner/labels"
import { holePinFor as holePinForFeatures } from "@/lib/planner/geometry"
import type { CourseHit, NoHazardMap } from "@/lib/planner/storage"
import { useClubRanking, type RankingRequest } from "@/components/simulator/useClubRanking"
import type { CalibratedClub } from "@/components/simulator/CourseMapClient"

const DOTS_SHOWN = 400
const HANDICAP_SHOTS_PER_CLUB = 1000

export interface PlanInputs {
  calibrated: CalibratedClub[] | null
  source: "calibrated" | "handicap"
  bag: Club[]
  handicap: number
  driverCarry: string
  sevenIronCarry: string
  extraCarries: Partial<Record<Club, number>>
  tendency: Tendency
  compareAgainst: CompareAgainst
  trackedHandicap: number | null
  baseline: Baseline | null
  course: CourseHit | null
  geometry: CourseGeometry | null
  hole: CourseHole | null
  holeId: string | null
  ball: LatLng | null
  pinManual: LatLng | null
  aimManual: LatLng | null
  setAimManual: (p: LatLng | null) => void
  clubChoice: string
  setClubChoice: (club: string) => void
  zones: UserZone[]
  noHazard: NoHazardMap
  showTrouble: boolean
  showRings: boolean
}

export function usePlan({
  calibrated,
  source,
  bag,
  handicap,
  driverCarry,
  sevenIronCarry,
  extraCarries,
  tendency,
  compareAgainst,
  trackedHandicap,
  baseline,
  course,
  geometry,
  hole,
  holeId,
  ball,
  pinManual,
  aimManual,
  setAimManual,
  clubChoice,
  setClubChoice,
  zones,
  noHazard,
  showTrouble,
  showRings,
}: PlanInputs) {
  // ---------- golfer shots ----------
  // Clubs in the bag with no measured shots are estimated from the golfer's
  // nearest measured club (see fillBag); this remembers which, for the UI.
  const calibratedBag = useMemo(
    () => (source === "calibrated" && calibrated ? fillBag(calibrated, bag) : null),
    [source, calibrated, bag]
  )
  const estimatedFrom = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of calibratedBag ?? []) if (c.estimatedFrom) m[c.club] = c.estimatedFrom
    return m
  }, [calibratedBag])

  const clubShots: ClubShots[] = useMemo(() => {
    if (calibratedBag) {
      return calibratedBag.map((c) => ({ club: c.club, shots: c.shots }))
    }
    // Blank or out-of-range carries are ignored, so a half-typed number doesn't warp the bag.
    const known: Partial<Record<Club, number>> = { ...extraCarries }
    const d = Number(driverCarry)
    const i7 = Number(sevenIronCarry)
    if (d >= 120 && d <= 380) known.Driver = d
    if (i7 >= 60 && i7 <= 240) known["7-Iron"] = i7
    const all = generateCustomGolferShots(
      { handicapIndex: handicap, knownCarries: known, tendency },
      HANDICAP_SHOTS_PER_CLUB * bag.length,
      42,
      bag
    )
    const by = new Map<string, { carryYds: number; offlineYds: number }[]>()
    for (const s of all) {
      const list = by.get(s.club) ?? []
      list.push({ carryYds: s.carryYds, offlineYds: s.offlineYds })
      by.set(s.club, list)
    }
    return Array.from(by, ([club, shots]) => ({ club, shots }))
  }, [calibratedBag, handicap, driverCarry, sevenIronCarry, extraCarries, tendency, bag])

  // The bag's driver carry (or its longest club, if there's no driver in the bag)
  // sets the recommended tee length.
  const bagDriverCarry = useMemo(() => {
    const d = clubShots.find((c) => c.club === "Driver")
    return d && d.shots.length ? d.shots.reduce((a, s) => a + s.carryYds, 0) / d.shots.length : null
  }, [clubShots])

  const longestCarry = useMemo(() => {
    let best = 0
    for (const c of clubShots) {
      if (!c.shots.length) continue
      const m = c.shots.reduce((a, s) => a + s.carryYds, 0) / c.shots.length
      if (m > best) best = m
    }
    return best
  }, [clubShots])

  // Memoized so its reference only changes when the underlying pin genuinely
  // moves -- holePinFor can return a freshly-built point (nearest green
  // centroid), and several effects below tell "a new stance" from "just
  // re-rendered" by reference, which an unstable pin would break.
  const pin: LatLng | null = useMemo(
    () => pinManual ?? (hole ? holePinForFeatures(hole, geometry?.features ?? []) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinManual, hole, geometry]
  )

  const defaultAim: LatLng | null = useMemo(() => {
    if (!pin) return null
    if (hole && ball && distanceYds(ball, hole.line[0]) < 25) {
      // On the tee: aim for the middle of the fairway.
      return defaultTeeAim(hole.line, pin, geometry?.features ?? [], longestCarry)
    }
    return pin // anywhere else: aim at the pin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole, ball, pin, longestCarry, geometry])
  const aim = aimManual ?? defaultAim

  // Which way the hole plays (tee -> green), for the compass overlay -- the hole's own
  // fixed direction, not wherever the golfer currently stands.
  const holeBearingDeg = useMemo(() => (hole && pin ? bearingDeg(hole.line[0], pin) : null), [hole, pin])

  // ---------- planning ----------
  // What's actually mapped for the CURRENT hole vs. hand-drawn vs. missing --
  // drives both the data-quality badge and the fairway fallback below.
  const holeQuality: HoleDataQuality | null = useMemo(() => {
    if (!hole || !geometry) return null
    return applyConfirmedAbsent(assessHoleDataQuality(hole, geometry.features, zones), noHazard[hole.id] ?? {})
  }, [hole, geometry, zones, noHazard])

  // "estimated" only happens when neither OSM nor a hand-drawn zone has a
  // fairway for this hole -- fill in a corridor so club/aim scoring has
  // something to work with instead of treating the whole hole as rough.
  const fairwayEstimated = holeQuality?.fairway === "estimated"
  const corridor: CourseFeature | null = useMemo(
    () => (hole && geometry && fairwayEstimated ? estimatedFairwayCorridor(hole, holePinForFeatures(hole, geometry?.features ?? [])) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hole, geometry, fairwayEstimated]
  )

  // What the lie map is built from -- also sent to the club-ranking worker, which builds its own copy.
  const lieInputs: LieInputs | null = useMemo(() => {
    if (course?.lat == null || course.lng == null) return null
    return {
      origin: { lat: course.lat, lng: course.lng },
      features: [...(geometry?.features ?? []), ...(corridor ? [corridor] : [])],
      coast: geometry?.coast ?? [],
      zones,
      extras: { boundary: geometry?.boundary ?? null, lines: geometry?.lines ?? [] },
    }
  }, [course, geometry, zones, corridor])
  const lies = useMemo(() => (lieInputs ? buildLieMapFrom(lieInputs) : null), [lieInputs])

  // Where the ball is lying: the tee uses the tour tee-shot baseline, anything else its mapped lie.
  const startLie: StartLie = useMemo(() => {
    if (!ball) return "fairway"
    if (hole && distanceYds(ball, hole.line[0]) < 15) return "tee"
    return lies ? lies.lieAt(ball) : "fairway"
  }, [ball, hole, lies])

  // ---------- club ranking: every club at its own best aim ----------
  // Ranked in a Web Worker (useClubRanking) so the map never stutters. It
  // depends on the ball, pin, map and bag -- not on the aim marker, since
  // each club searches for its own aim.
  // The handicap the plan is scored against: the latest calculated index, else the one from setup, else this
  // device's planner handicap (10 until a guest sets one). Null = the PGA TOUR, if the golfer chose it on You.
  const baselineHandicap: number | null =
    compareAgainst === "tour" ? null : trackedHandicap ?? baseline?.handicapIndex ?? (Number.isFinite(handicap) ? handicap : DEFAULT_BASELINE_HANDICAP)
  const scoreBaseline = getBaseline(baselineHandicap)

  const rankingRequest: RankingRequest | null = useMemo(
    () =>
      ball && pin && defaultAim
        ? { holeId, from: ball, aim: defaultAim, pin, startLie, line: hole?.line ?? null, handicap: baselineHandicap }
        : null,
    [holeId, ball, pin, defaultAim, startLie, hole, baselineHandicap]
  )
  const rankState = useClubRanking(lieInputs, clubShots, rankingRequest)
  const ranking: OptimizedClubPlan[] = rankState.results ?? []
  const rankingPending = rankState.pending

  const shownLies = LIES.filter((l) => ALWAYS_SHOWN.includes(l) || ranking.some((r) => r.plan.lieShare[l] >= 0.005))
  const best: OptimizedClubPlan | null = ranking[0] ?? null
  const chosen: OptimizedClubPlan | null = ranking.find((r) => r.club === clubChoice) ?? best
  const chosenShots = chosen ? clubShots.find((c) => c.club === chosen.club) : undefined

  // The chosen club where the aim marker actually points, with every shot: what the dots, "Finishes" and "leaves" describe.
  const chosenLive = useMemo(() => {
    if (!chosenShots || !ball || !aim || !pin || !lies) return null
    return evaluateClub(chosenShots, { from: ball, aim, pin, lies, startLie, baseline: scoreBaseline })
  }, [chosenShots, ball, aim, pin, lies, startLie, scoreBaseline])
  // The ranking's own held-out shots at the aim marker: the "At your aim" number.
  const chosenAtAim = useMemo(() => {
    if (!chosenShots || !ball || !aim || !pin || !lies) return null
    return strokesAtAim(chosenShots, { from: ball, aim, pin, lies, startLie, baseline: scoreBaseline })
  }, [chosenShots, ball, aim, pin, lies, startLie, scoreBaseline])
  const atBestAim = !!chosen && !!ball && !!aim && isAtBestAim(ball, aim, chosen)

  function aimAtBest(r: OptimizedClubPlan) {
    if (!ball || !pin) return
    setAimManual(aimMarkerFor(ball, pin, r))
  }

  function pickClub(r: OptimizedClubPlan) {
    setClubChoice(r.club)
    aimAtBest(r)
  }

  // When a new stance (ball, pin, map or bag) has been ranked, move the aim to
  // the chosen club's best -- or the best club's, on auto. A drag after that
  // sticks until the stance changes again.
  const appliedRankingKey = useRef<string | null>(null)
  useEffect(() => {
    if (!rankState.key || appliedRankingKey.current === rankState.key) return
    appliedRankingKey.current = rankState.key
    const target = ranking.find((r) => r.club === clubChoice) ?? ranking[0]
    if (target) aimAtBest(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankState.key])

  const landings = useMemo(() => {
    if (!chosenShots || !ball || !aim || !lies) return []
    return simulateLandings(chosenShots.club, seededSample(chosenShots.shots, DOTS_SHOWN, 3), ball, bearingDeg(ball, aim), lies)
  }, [chosenShots, ball, aim, lies])

  // Trouble map: what each spot around the hole costs compared with a fairway lie.
  const troubleCells = useMemo(() => {
    if (!showTrouble || !ball || !pin || !lies) return []
    const pts = [ball, aim ?? pin, pin, ...(hole?.line ?? [])]
    return buildValueGrid(pts, pin, ball, startLie, lies, scoreBaseline).flatMap((c) => {
      const { color, opacity } = deltaColor(c.delta)
      return opacity > 0 ? [{ sw: c.sw, ne: c.ne, color, opacity }] : []
    })
  }, [showTrouble, ball, aim, pin, hole, lies, startLie, scoreBaseline])

  // 50% and 90% dispersion rings around where the chosen club's shots finish.
  const rings = useMemo(() => {
    if (!showRings || landings.length < 5) return []
    const pts = landings.map((l) => l.point)
    return [dispersionRing(pts, 1.177), dispersionRing(pts, 2.146)].filter((r) => r.length > 0)
  }, [showRings, landings])

  const stats = useMemo(() => {
    const count = (k: string) => (geometry?.features ?? []).filter((f) => f.kind === k).length
    return { greens: count("green"), fairways: count("fairway"), bunkers: count("bunker"), water: count("water"), trees: count("trees"), range: count("range") }
  }, [geometry])

  const distPin = ball && pin ? distanceYds(ball, pin) : null
  const distAim = ball && aim ? distanceYds(ball, aim) : null
  const aimToPin = aim && pin ? distanceYds(aim, pin) : null
  const aimIsPin = aimToPin != null && aimToPin < 3
  // What the chosen club's pattern leaves: from its average finish point (after roll) to the pin.
  const avgLeft = pin && chosenLive ? distanceYds(chosenLive.meanRest, pin) : null

  const labels = useMemo(() => {
    const out: { pos: LatLng; text: string }[] = []
    if (ball && aim && distAim != null && distAim > 3) {
      out.push({ pos: { lat: (ball.lat + aim.lat) / 2, lng: (ball.lng + aim.lng) / 2 }, text: `${Math.round(distAim)} yd` })
    }
    if (aim && pin && aimToPin != null && aimToPin >= 3) {
      out.push({ pos: { lat: (aim.lat + pin.lat) / 2, lng: (aim.lng + pin.lng) / 2 }, text: `${Math.round(aimToPin)} to pin` })
    }
    return out
  }, [ball, aim, pin, distAim, aimToPin])
  const fromLabel = startLie === "tee" ? "the tee" : startLie === "oob" ? "out of bounds" : `the ${startLie}`
  const planReady = !!ball && !!pin

  return {
    aim,
    aimAtBest,
    aimIsPin,
    aimToPin,
    atBestAim,
    avgLeft,
    bagDriverCarry,
    baselineHandicap,
    best,
    calibratedBag,
    chosen,
    chosenAtAim,
    chosenLive,
    chosenShots,
    clubShots,
    corridor,
    defaultAim,
    distAim,
    distPin,
    estimatedFrom,
    fairwayEstimated,
    fromLabel,
    holeBearingDeg,
    holeQuality,
    labels,
    landings,
    lieInputs,
    lies,
    longestCarry,
    pickClub,
    pin,
    planReady,
    rankState,
    ranking,
    rankingPending,
    rankingRequest,
    rings,
    scoreBaseline,
    shownLies,
    startLie,
    stats,
    troubleCells,
  }
}

export type PlanState = ReturnType<typeof usePlan>
