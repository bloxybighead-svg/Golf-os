"use client"

// The Play planner's numbers: the golfer's shots, the hole's pin and aim, the
// lie map, the club ranking (each club at its own best aim, in a Web Worker --
// see components/simulator/useClubRanking.ts), the chosen club, its dots, rings
// and the map labels (moved verbatim from CourseMapClient.tsx).

import { useEffect, useMemo, useRef, useState } from "react"
import { bearingDeg, distanceYds, type LatLng } from "@/lib/course/geo"
import { defaultTeeAim } from "@/lib/course/aim"
import type { StartLie } from "@/lib/course/cost"
import { applyConfirmedAbsent, assessHoleDataQuality, estimatedFairwayCorridor, type HoleDataQuality } from "@/lib/course/dataQuality"
import { buildValueGrid, deltaColor, dispersionRing } from "@/lib/course/heatmap"
import type { UserZone } from "@/lib/course/lies"
import type { CourseFeature, CourseGeometry, CourseHole } from "@/lib/course/overpass"
import { aimMarkerFor, evaluateClub, isAtBestAim, simulateLandings, strokesAtAim, type ClubShots, type OptimizedClubPlan } from "@/lib/course/plan"
import { buildLieMapFrom, type LieInputs } from "@/lib/course/rankRequest"
import { COLD_TIP_BELOW_F, conditionsKey, DEFAULT_BASELINE_TEMP_F, hasEffect, playsLike, playsLikeBreakdown, type PlaysLike, type ShotConditions } from "@/lib/course/playsLike"
import { useHoleElevation } from "@/hooks/useHoleElevation"
import { usePlaysLikeSetting } from "@/hooks/usePlaysLikeSetting"
import { useWind } from "@/hooks/useWind"
import { goRows, optionsFor, smartRows, tradeoffText } from "@/lib/course/rankOptions"
import { widenShots } from "@/lib/course/strategy"
import { obBandsFor, type ObBand, type ObTag } from "@/lib/course/obTags"
import { DEFAULT_BASELINE_HANDICAP, getBaseline, type CompareAgainst } from "@/lib/course/baseline"
import { seededSample } from "@/lib/dispersion/stats"
import { generateCustomGolferShots, type Tendency } from "@/lib/golfer/build"
import type { Club } from "@/lib/golfer/tables"
import { fillBag } from "@/lib/golfer/bag"
import type { Baseline } from "@/lib/golfer/baseline"
import { ALWAYS_SHOWN, LIES } from "@/lib/planner/labels"
import { chosenPlan, choiceAfterBallMove, choiceClub, choiceFor, choiceInBag, choiceMode } from "@/lib/planner/clubChoice"
import { holePinFor as holePinForFeatures } from "@/lib/planner/geometry"
import type { CourseHit, NoHazardMap } from "@/lib/planner/storage"
import { useClubRanking, type RankingRequest } from "@/components/simulator/useClubRanking"
import type { CalibratedClub, MyProfile, ShotSource } from "@/lib/planner/types"
import { generateMyBag } from "@/lib/golfer/shotProfile"

const DOTS_SHOWN = 400
const HANDICAP_SHOTS_PER_CLUB = 1000

export interface PlanInputs {
  calibrated: CalibratedClub[] | null
  /** The golfer's own fitted profile (My shots). */
  myProfile: MyProfile | null
  source: ShotSource
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
  /** The offline-spread multiplier applied to every club (You -> Planner). */
  onCourseSpread: number
  /** The golfer's OB tags for the current hole (saved per course + hole). */
  obTags: ObTag[]
  /** A round is being played: the wind is refreshed every 15 minutes. */
  roundActive: boolean
}

export function usePlan({
  calibrated,
  myProfile,
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
  onCourseSpread,
  obTags,
  roundActive,
}: PlanInputs) {
  // ---------- golfer shots ----------
  // Clubs in the bag with no measured shots are estimated from the golfer's
  // nearest measured club (see fillBag); this remembers which, for the UI.
  const calibratedBag = useMemo(
    () => (source === "legacy" && calibrated ? fillBag(calibrated, bag) : null),
    [source, calibrated, bag]
  )
  // My shots: fitted clubs from the golfer's profile, thin clubs blended with a
  // handicap profile, the rest estimated (lib/golfer/shotProfile.ts). The handicap
  // that blends in is the tracked one, else the setup one, else the device's.
  const blendHandicap = Math.round(trackedHandicap ?? baseline?.handicapIndex ?? handicap)
  const myBag = useMemo(
    () => (source === "calibrated" && myProfile ? generateMyBag(myProfile.fits, bag, blendHandicap) : null),
    // The profile object is replaced whenever it is re-fitted.
    [source, myProfile, bag, blendHandicap]
  )
  // Why a club's shots are an estimate, in words, for the "est." marker and the result card.
  const estimateNotes = useMemo(() => {
    if (myBag) return myBag.notes
    const m: Record<string, string> = {}
    for (const c of calibratedBag ?? []) if (c.estimatedFrom) m[c.club] = `No ${c.club} shots on record: estimated from your ${c.estimatedFrom}`
    return m
  }, [myBag, calibratedBag])

  const clubShots: ClubShots[] = useMemo(() => {
    if (myBag) return myBag.clubs.map((c) => ({ club: c.club, shots: c.shots }))
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
  }, [myBag, calibratedBag, handicap, driverCarry, sevenIronCarry, extraCarries, tendency, bag])

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

  // ---------- plays like: ground height and wind ----------
  // Applied to every sampled shot inside the simulation (lib/course/playsLike.ts), so the club ranking, the
  // aim search and the penalty shares include it. Switched off (or with no wind and no ground heights) the
  // plan is exactly the still-air, level-ground one.
  const [playsLikeOn, setPlaysLikeOn] = usePlaysLikeSetting()
  const elevation = useHoleElevation(course?.id ?? null, holeId, hole?.line ?? null)
  const wind = useWind({ courseId: course?.id ?? null, center: course?.lat != null && course.lng != null ? { lat: course.lat, lng: course.lng } : null, roundActive })
  // Today's air temperature is adjusted against the temperature the golfer's carries were measured at: their
  // sessions' average on My shots, 70 F for a handicap estimate or the old public data.
  const temperatureF = wind.temperature.temperatureF
  const baselineF = source === "calibrated" && myProfile ? myProfile.baselineTemperatureF : DEFAULT_BASELINE_TEMP_F
  const conditions: ShotConditions | null = useMemo(() => {
    if (!playsLikeOn) return null
    const c: ShotConditions = { wind: wind.wind, elevation, temperatureF, baselineF }
    return hasEffect(c) ? c : null
  }, [playsLikeOn, wind.wind, elevation, temperatureF, baselineF])
  const conditionsId = conditionsKey(conditions)

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

  // OB the map doesn't have: the golfer's "OB left / right / long" tags for this hole become out-of-bounds zones.
  const obBands: ObBand[] = useMemo(
    () => (hole && obTags.length > 0 ? obBandsFor(hole.line, geometry?.features ?? [], obTags) : []),
    [hole, geometry, obTags]
  )
  const allZones = useMemo(() => (obBands.length > 0 ? [...zones, ...obBands.map((b) => b.zone)] : zones), [zones, obBands])

  // What the lie map is built from -- also sent to the club-ranking worker, which builds its own copy.
  const lieInputs: LieInputs | null = useMemo(() => {
    if (course?.lat == null || course.lng == null) return null
    return {
      origin: { lat: course.lat, lng: course.lng },
      features: [...(geometry?.features ?? []), ...(corridor ? [corridor] : [])],
      coast: geometry?.coast ?? [],
      zones: allZones,
      extras: { boundary: geometry?.boundary ?? null, lines: geometry?.lines ?? [] },
    }
  }, [course, geometry, allZones, corridor])
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

  // Long holes (par 5s, par 4s over 440 yd) value the tee shot by what it leaves for the next one.
  const holeYards = hole && pin ? hole.yardageYds ?? Math.round(distanceYds(hole.line[0], pin)) : null
  const rankingRequest: RankingRequest | null = useMemo(
    () =>
      ball && pin && defaultAim
        ? {
            holeId,
            from: ball,
            aim: defaultAim,
            pin,
            startLie,
            line: hole?.line ?? null,
            handicap: baselineHandicap,
            spread: onCourseSpread,
            par: hole?.par ?? null,
            yards: holeYards,
            conditions,
            conditionsKey: conditionsId,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holeId, ball, pin, defaultAim, startLie, hole, baselineHandicap, onCourseSpread, holeYards, conditionsId]
  )
  const rankState = useClubRanking(lieInputs, clubShots, rankingRequest)
  // The ranking is by expected strokes, with the spread applied. The card offers two options from it: smart play (the
  // default: safer, but never far from the lowest strokes) and go for it (the lowest strokes). Smart play goes first,
  // so "auto" picks it; the golfer taps Go for it (or any club) to change.
  const rankRaw = rankState.results ?? []
  const options = useMemo(() => optionsFor(rankRaw), [rankRaw])
  // Smart play (the default) shows every club at its safe aim, best first; Go for it shows every club at its
  // strokes-best aim. Which one is on is part of the club choice (lib/planner/clubChoice.ts).
  const strategyMode = choiceMode(clubChoice)
  const ranking: OptimizedClubPlan[] = useMemo(() => {
    if (!options) return rankRaw
    if (strategyMode === "go") return [options.lowest, ...goRows(rankRaw).filter((r) => r.club !== options.lowest.club)]
    return [options.safer, ...smartRows(rankRaw).filter((r) => r.club !== options.safer.club)]
  }, [options, rankRaw, strategyMode])
  const rankingPending = rankState.pending
  const optionsNote = useMemo(() => (options ? { ...options, tradeoff: tradeoffText(options) } : null), [options])

  const shownLies = LIES.filter((l) => ALWAYS_SHOWN.includes(l) || ranking.some((r) => r.plan.lieShare[l] >= 0.005))
  const best: OptimizedClubPlan | null = ranking[0] ?? null
  // A picked club keeps showing while a new ranking is worked out (lib/planner/clubChoice.ts).
  const lastChosen = useRef<OptimizedClubPlan | null>(null)
  const chosen: OptimizedClubPlan | null = chosenPlan(ranking, clubChoice, lastChosen.current)
  lastChosen.current = chosen
  // The dots and "leaves" use the same widened spread the ranking used.
  const playShots = useMemo(() => clubShots.map((c) => widenShots(c, onCourseSpread)), [clubShots, onCourseSpread])
  const chosenShots = chosen ? playShots.find((c) => c.club === chosen.club) : undefined

  // A pick is for this shot: it resets once the ball is carried to the next shot.
  const [pickedAt, setPickedAt] = useState<LatLng | null>(null)
  useEffect(() => {
    if (clubChoice === "auto") return
    if (!pickedAt && ball) return setPickedAt(ball)
    const next = choiceAfterBallMove(clubChoice, pickedAt, ball)
    if (next !== clubChoice) setClubChoice(next)
  }, [ball, pickedAt, clubChoice, setClubChoice])

  // A picked club that leaves the bag (or a switch to a source without it) goes back to auto.
  useEffect(() => {
    const next = choiceInBag(clubChoice, clubShots.map((c) => c.club))
    if (next !== clubChoice) setClubChoice(next)
  }, [clubShots, clubChoice, setClubChoice])

  // The chosen club where the aim marker actually points, with every shot: what the dots, "Finishes" and "leaves" describe.
  const chosenLive = useMemo(() => {
    if (!chosenShots || !ball || !aim || !pin || !lies) return null
    return evaluateClub(chosenShots, { from: ball, aim, pin, lies, startLie, baseline: scoreBaseline, conditions })
  }, [chosenShots, ball, aim, pin, lies, startLie, scoreBaseline, conditions])
  // The ranking's own held-out shots at the aim marker: the "At your aim" number.
  const chosenAtAim = useMemo(() => {
    if (!chosenShots || !ball || !aim || !pin || !lies) return null
    return strokesAtAim(chosenShots, { from: ball, aim, pin, lies, startLie, baseline: scoreBaseline, conditions })
  }, [chosenShots, ball, aim, pin, lies, startLie, scoreBaseline, conditions])
  const atBestAim = !!chosen && !!ball && !!aim && isAtBestAim(ball, aim, chosen)

  function aimAtBest(r: OptimizedClubPlan) {
    if (!ball || !pin) return
    setAimManual(aimMarkerFor(ball, pin, r))
  }

  function pickClub(r: OptimizedClubPlan) {
    setClubChoice(choiceFor(r))
    setPickedAt(ball)
    aimAtBest(r)
  }

  // When a new stance (ball, pin, map or bag) has been ranked, move the aim to
  // the chosen club's best -- or the best club's, on auto. A drag after that
  // sticks until the stance changes again.
  const appliedRankingKey = useRef<string | null>(null)
  useEffect(() => {
    if (!rankState.key || appliedRankingKey.current === rankState.key) return
    appliedRankingKey.current = rankState.key
    const target = ranking.find((r) => r.club === choiceClub(clubChoice)) ?? ranking[0]
    if (target) aimAtBest(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankState.key])

  const landings = useMemo(() => {
    if (!chosenShots || !ball || !aim || !lies) return []
    return simulateLandings(chosenShots.club, seededSample(chosenShots.shots, DOTS_SHOWN, 3), ball, bearingDeg(ball, aim), lies, undefined, conditions)
  }, [chosenShots, ball, aim, lies, conditions])

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
  // The distance to the pin as it plays for the chosen club: height change, wind and temperature (null when none applies).
  const pinPlaysLike: (PlaysLike & { breakdown: string }) | null = useMemo(() => {
    if (!ball || !pin || !chosen || !conditions) return null
    const p = playsLike(distanceYds(ball, pin), ball, pin, bearingDeg(ball, pin), chosen.club, conditions)
    return p ? { ...p, breakdown: playsLikeBreakdown(p) } : null
  }, [ball, pin, chosen, conditions])
  const distAim = ball && aim ? distanceYds(ball, aim) : null
  const aimToPin = aim && pin ? distanceYds(aim, pin) : null
  const aimIsPin = aimToPin != null && aimToPin < 3
  // What the chosen club's pattern leaves: from its average finish point (after roll) to the pin.
  const avgLeft = pin && chosenLive ? distanceYds(chosenLive.meanRest, pin) : null

  const labels = useMemo(() => {
    // Each label belongs on a line; the map slides it off the green and the pin (lib/planner/labelPlacement).
    const out: { from: LatLng; to: LatLng; text: string }[] = []
    if (ball && aim && distAim != null && distAim > 3) out.push({ from: ball, to: aim, text: `${Math.round(distAim)} yd` })
    if (aim && pin && aimToPin != null && aimToPin >= 3) out.push({ from: aim, to: pin, text: `${Math.round(aimToPin)} to pin` })
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
    estimateNotes,
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
    strategyMode,
    optionsNote,
    pinPlaysLike,
    coldTip: temperatureF != null && temperatureF < COLD_TIP_BELOW_F,
    wind,
    playsLikeOn,
    setPlaysLikeOn,
    hasElevation: !!elevation,
    obBands,
    allZones,
    stats,
    troubleCells,
  }
}

export type PlanState = ReturnType<typeof usePlan>
