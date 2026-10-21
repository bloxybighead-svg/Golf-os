"use client"

// Everything the Play planner page does apart from drawing it: the hooks
// (settings, course, zones, ball, plan), the page's own toggles, start-up
// (resume the last course or round) and the moves that touch several hooks at
// once -- loading a course, picking a hole. Moved verbatim from
// CourseMapClient.tsx; PlannerView draws what this returns.

import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import type { PlannerProps as Props } from "@/lib/planner/types"
import { bearingDeg, distanceYds, type LatLng } from "@/lib/course/geo"
import type { FitRequest } from "@/lib/planner/orientation"
import { type ConfirmableHazard } from "@/lib/course/dataQuality"
import { type CourseHole } from "@/lib/course/overpass"
import type { Club } from "@/lib/golfer/tables"
import { type HoleCorrectionSubmission } from "@/components/simulator/EditHoleModal"
import { type RoundSheet } from "@/components/play/RoundSheets"
import { loadActiveRound, nextUnscored, saveActiveRound, type ActiveRound } from "@/lib/rounds/activeRound"
import { nextHoleTarget } from "@/lib/rounds/holeOffer"
import { addShotAtMidpoint, deleteShot, editShot, lastShotOn, moveSplit, recordShot, UNKNOWN_CLUB } from "@/lib/rounds/shots"
import type { BallNow } from "@/lib/rounds/holeTracking"
import { buildBagNumbers } from "@/lib/you/bagNumbers"
import { typedCarries } from "@/lib/golfer/bagShots"
import { type Placing } from "@/components/simulator/courseColors"
import { shortCourseName } from "@/lib/planner/labels"
import { AUTO_AIM, aimReducer } from "@/lib/planner/aimMode"
import { choiceAfterHolePick, choiceClub } from "@/lib/planner/clubChoice"
import { ONBOARDED_KEY, applyBaselineToDevice, type Baseline, type CourseRef } from "@/lib/golfer/baseline"
import { isFirstVisit } from "@/lib/planner/firstRun"
import { saveBaseline } from "@/app/welcome/actions"
import { DEFAULT_COURSE, DEFAULT_HOLE_REF, hasHomeCourse, loadLastPosition, loadNoHazard, loadZoom, saveLastPosition, updateLastPositionHole, type CourseHit } from "@/lib/planner/storage"
import { holeFitPoints, holePinFor as holePinForFeatures } from "@/lib/planner/geometry"
import { usePlannerSettings } from "@/hooks/usePlannerSettings"
import { useAuthUser } from "@/hooks/useAuthUser"
import { useCourseGeometry, type AutoHole, type OnGeometryApplied } from "@/hooks/useCourseGeometry"
import { useZones } from "@/hooks/useZones"
import { useBallPosition } from "@/hooks/useBallPosition"
import { usePlan } from "@/hooks/usePlan"
import { useObTags } from "@/hooks/useObTags"
import { useNextHoleOffer } from "@/hooks/useNextHoleOffer"
import { hasOobBesideLine } from "@/lib/course/obTags"
import { hasAnswered } from "@/lib/planner/obTagStore"
import { kvDelete, kvGet, kvSet } from "@/lib/offline/db"
import { prefetchForRound, type PrefetchReport } from "@/lib/offline/snapshots"

/** The round in progress, copied into IndexedDB on every tap (localStorage has it too; this one survives more). */
const ACTIVE_ROUND_IDB_KEY = "activeRound"

export function usePlannerController({ calibrated, myProfile = null, trackedHandicap, baseline }: Props) {
  const { supabase, authUser } = useAuthUser()

  // --- course search / loading ---
  const geo = useCourseGeometry({ supabase, authUser })
  const {
    query, setQuery, hits, setHits, searching, searched, course, setCourse, geometry, setGeometry, loadState,
    setLoadState, loadError, setLoadError, refreshing, initialZoom, setInitialZoom, editingHole,
    setEditingHole, correctionSubmitting, correctionNote, loadNeedsSignIn, searchError,
  } = geo

  // --- golfer (whose shots, bag, carries; saved on this device) ---
  const settings = usePlannerSettings({ calibrated, myProfile, baseline, signedIn: !!authUser })
  const {
    source, setSource, handicap, setHandicap, driverCarry, setDriverCarry, sevenIronCarry, setSevenIronCarry,
    tendency, setTendency, extraCarries, wedgeCarries, bag, compareAgainst, recent,
    hydrated, remember,
  } = settings
  // A round being scored (kept on the device) and which of its sheets is open.
  const [round, setRound] = useState<ActiveRound | null>(null)
  const [homeChosen, setHomeChosen] = useState(true) // read from the device on mount
  // A first visit opens the "Find your course" screen instead of the demo hole.
  const [firstRun, setFirstRun] = useState(false)
  const [roundSheet, setRoundSheet] = useState<RoundSheet | null>(null)

  // --- positions ---
  const [holeId, setHoleId] = useState<string | null>(null)
  const [aimState, dispatchAim] = useReducer(aimReducer, AUTO_AIM)
  const [pinManual, setPinManual] = useState<LatLng | null>(null)
  const [placing, setPlacing] = useState<Placing>("ball")
  const [clubChoice, setClubChoiceRaw] = useState<string>("auto")
  // A different club puts the aim back on auto.
  const setClubChoice = (club: string) => {
    dispatchAim({ type: "reset" })
    setClubChoiceRaw(club)
  }
  const zoneState = useZones({ supabase, authUser, course })
  const {
    zones, noHazard, setNoHazard, drawKind, setDrawKind,
    pendingPoints, setPendingPoints, startDraw, addDrawPoint,
    undoDrawPoint, cancelDraw, finishDraw, deleteZone,
  } = zoneState
  const [showTrouble, setShowTrouble] = useState(false)
  const [showEllipse, setShowEllipse] = useState(true)
  const [showCarry, setShowCarry] = useState(false) // dots are where shots stop; this adds where they landed
  const [showZones, setShowZones] = useState(false) // marked outlines start hidden; they still count in the plan
  const [pickerOpen, setPickerOpen] = useState(false) // the course/hole/golfer sheet behind the title line
  const [showMarks, setShowMarks] = useState(false) // hand-drawn marks list under the map, collapsed by default
  const [showLayersMenu, setShowLayersMenu] = useState(false) // map toggles and "Mark an area", behind one button
  const [sheetOpen, setSheetOpen] = useState(false) // phones: club table bottom sheet, collapsed by default
  const layersMenuRef = useRef<HTMLDivElement>(null)
  // Map taps are ignored briefly after the club sheet closes, so the closing tap can't
  // land on the map underneath (moving the ball or picking a hole).
  const mapTapGuardUntil = useRef(0)
  // Rendered through a portal (see below), so its position is tracked in viewport
  // coordinates rather than relying on CSS positioning relative to an ancestor.
  const [layersMenuPos, setLayersMenuPos] = useState<{ top: number; left: number } | null>(null)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<FitRequest>({ points: [], key: "none" })
  // The ball moving (GPS or a drag) never makes a shot: shots are tapped in (tapShot below).
  const ballState = useBallPosition({
    setFit,
    onBallMoved: () => dispatchAim({ type: "reset" }),
  })
  const { ball, setBall, following, gpsAccuracyYds, gpsError, gpsNote, stopFollowing, moveBallTo, toggleFollow } = ballState

  // ---------- remembered settings and recent courses (this device only) ----------
  // Runs once. The guard matters in development, where React runs mount effects
  // twice: the second pass would read back the "course, no hole yet" position the
  // first pass just saved and open hole 1 instead of the intended one.
  const initRef = useRef(false)
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    try {
      settings.loadFromDevice() // setup numbers, saved settings, recent courses
      setHomeChosen(hasHomeCourse())
      // Resume where the golfer left off; a first visit opens on the default hole.
      // A round in progress wins: reopening mid-round lands back on its course.
      const active = loadActiveRound()
      setRound(active)
      if (active) void kvSet(ACTIVE_ROUND_IDB_KEY, active)
      // localStorage lost it (cleared, evicted)? The IndexedDB copy brings the round back.
      else
        void kvGet<ActiveRound>(ACTIVE_ROUND_IDB_KEY).then((saved) => {
          const r = saved?.value
          if (r && typeof r.id === "string" && Array.isArray(r.holes) && r.holes.length > 0 && !loadActiveRound()) {
            setRound(r)
            saveActiveRound(r)
          }
        })
      const last = loadLastPosition()
      if (active && last?.course.id !== active.course.id) {
        void loadCourse(active.course, { autoHoleRef: nextUnscored(active) ?? active.startHole })
      } else if (last) void loadCourse(last.course, last.holeId ? { autoHoleId: last.holeId } : { autoFirstHole: true })
      else if (isFirstVisit({ hasLastCourse: false, onboarded: localStorage.getItem(ONBOARDED_KEY), hasBaseline: !!baseline })) setFirstRun(true)
      else void loadCourse(DEFAULT_COURSE, { autoHoleRef: DEFAULT_HOLE_REF })
    } catch {
      /* private mode or corrupt data: start from defaults */
    }
    settings.markHydrated()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escape closes the course/hole sheet.
  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickerOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [pickerOpen])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [sheetOpen])

  // Close the Layers menu on an outside tap. A visual backdrop element would need its
  // z-index compared against the map's own stacking context (the map wrapper below establishes
  // one), which turned out unreliable -- a plain listener sidesteps that entirely.
  useEffect(() => {
    if (!showLayersMenu) return
    function onDocClick(e: MouseEvent) {
      if (layersMenuRef.current && !layersMenuRef.current.contains(e.target as Node)) setShowLayersMenu(false)
    }
    document.addEventListener("click", onDocClick)
    return () => document.removeEventListener("click", onDocClick)
  }, [showLayersMenu])

  async function loadCourse(c: CourseHit, opts?: AutoHole) {
    setCourse(c)
    setHits([])
    setGeometry(null)
    setHoleId(null)
    setBall(null)
    dispatchAim({ type: "reset" })
    setPinManual(null)
    setDrawKind(null)
    setPendingPoints([])
    setNoHazard(loadNoHazard(c.id))
    setInitialZoom(loadZoom(c.id))
    saveLastPosition({ course: c, holeId: null })
    if (c.lat == null || c.lng == null) {
      setLoadState("error")
      setLoadError("This course has no coordinates in the course database, so it can't be placed on the map.")
      return
    }
    remember(c)
    await fetchGeometry(c, opts)
  }

  // What a course's map data arriving does here: frame the course, then stand on a
  // hole straight away so a recommendation shows without any taps -- the remembered
  // hole, the default one, or hole 1 of a newly picked course. pickHole does its own
  // state resets, fine since nothing golfer-specific was set yet.
  const applyGeometry: OnGeometryApplied = (g, c, opts) => {
    const pts: LatLng[] = g.holes.flatMap((h) => h.line)
    setFit({ points: pts.length ? pts : [{ lat: c.lat as number, lng: c.lng as number }], bearingDeg: null, key: `course-${c.id}` })
    const target = opts?.autoHoleId
      ? g.holes.find((h) => h.id === opts.autoHoleId)
      : opts?.autoHoleRef
        ? g.holes.find((h) => h.ref === opts.autoHoleRef)
        : opts?.autoFirstHole
          ? g.holes[0]
          : undefined
    if (target) pickHole(target, g.features)
  }

  async function fetchGeometry(c: CourseHit, opts?: { force?: boolean } & AutoHole) {
    await geo.fetchGeometry(c, opts, applyGeometry)
  }

  async function refreshCourseData() {
    await geo.refreshCourseData(applyGeometry)
  }

  function toggleClub(c: Club) {
    settings.toggleClub(c) // a picked club that leaves the bag goes back to auto (usePlan)
  }

  // Previous/next hole from the title line, wrapping 18 -> 1 and 1 -> 18.
  // During a round it follows the round's holes instead (a back nine: 10..18).
  function neighbourHole(dir: 1 | -1): CourseHole | null {
    if (holes.length === 0) return null
    const i = holes.findIndex((h) => h.id === holeId)
    if (roundHere) {
      const order = roundHere.holes.map((h) => h.hole_number)
      const at = order.indexOf(i < 0 ? -1 : holes[i].ref ?? -1)
      const next = holes.find((h) => h.ref === order[at < 0 ? 0 : (at + dir + order.length) % order.length])
      if (next) return next
    }
    return i < 0 ? holes[0] : holes[(i + dir + holes.length) % holes.length]
  }
  function stepHole(dir: 1 | -1) {
    const h = neighbourHole(dir)
    if (h) pickHole(h)
  }
  function goToHoleNumber(n: number) {
    const h = holes.find((x) => x.ref === n)
    if (h) pickHole(h)
  }
  function changeRound(next: ActiveRound | null) {
    dispatchAim({ type: "reset" })
    setRound(next)
    saveActiveRound(next)
    void (next ? kvSet(ACTIVE_ROUND_IDB_KEY, next) : kvDelete(ACTIVE_ROUND_IDB_KEY))
  }
  /** The demo choice on the first-run screen: Pebble Beach, as a returning demo visitor would see it. */
  function startDemo() {
    setFirstRun(false)
    void loadCourse(DEFAULT_COURSE, { autoHoleRef: DEFAULT_HOLE_REF })
  }
  /** The first-run numbers become this device's setup (and the account's, when signed in), then Play opens on hole 1. */
  async function finishFirstRun(c: CourseRef, b: Baseline) {
    applyBaselineToDevice(b)
    if (authUser) await saveBaseline({ handicapIndex: b.handicapIndex, carries: b.carries, homeCourse: c }).catch(() => {})
    settings.loadFromDevice()
    setHomeChosen(true)
    setFirstRun(false)
    void loadCourse(c, { autoFirstHole: true })
  }
  function chooseCourse(c: CourseHit) {
    setQuery("")
    setPickerOpen(false)
    void loadCourse(c, { autoFirstHole: true })
  }

  // ---------- hole selection ----------
  const holes = geometry?.holes ?? []
  const hole: CourseHole | null = holes.find((h) => h.id === holeId) ?? null
  // The round in progress, when it's at the course that's open.
  const roundHere = round && course && round.course.id === course.id ? round : null

  // Start round: save what the planner needs for this course while there is signal (once per round per page load).
  const prefetchedFor = useRef<string | null>(null)
  const [offlineReport, setOfflineReport] = useState<PrefetchReport | null>(null)
  useEffect(() => {
    if (!roundHere || !geometry || prefetchedFor.current === roundHere.id) return
    prefetchedFor.current = roundHere.id
    void prefetchForRound({ courseId: roundHere.course.id, geometry }).then(setOfflineReport)
  }, [roundHere, geometry])
  useEffect(() => {
    if (!round) setOfflineReport(null)
  }, [round])

  // "On hole 8?": offered once this hole is scored and the golfer's GPS has sat at the next tee. Never switches by itself.
  const nextHoleOffer = useNextHoleOffer(ballState.fix, nextHoleTarget(roundHere, hole?.ref ?? null, holes))
  function answerHoleOffer(accepted: boolean) {
    if (accepted && nextHoleOffer.offer != null) goToHoleNumber(nextHoleOffer.offer)
    nextHoleOffer.answer()
  }

  const obTags = useObTags({ supabase, authUser, course })
  const plan = usePlan({
    calibrated,
    myProfile,
    source,
    bag,
    handicap,
    driverCarry,
    sevenIronCarry,
    extraCarries,
    wedgeCarries,
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
    aimState,
    dispatchAim,
    clubChoice,
    setClubChoice,
    zones,
    noHazard,
    showTrouble,
    showEllipse,
    onCourseSpread: settings.onCourseSpread,
    smartRisk: settings.smartRisk,
    obTags: obTags.tagsFor(holeId),
    roundActive: !!roundHere,
  })
  const {
    aim, aimAtBest, aimLie, atBestAim, avgLeft, bagDriverCarry, baselineHandicap, best, chosen,
    chosenAtAim, chosenLive, distPin, estimateNotes, fromLabel, holeBearingDeg, holeQuality, labels,
    landings, pickClub, pin, planReady, rankState, strategyMode, ranking, rankingPending, ellipse,
    scoreBaseline, shownLies, stats, troubleCells, optionsNote, obBands, lies,
    pinPlaysLike, greenYards, greenLabel, coldTip, wind, playsLikeOn, setPlaysLikeOn, hasElevation, startLie,
  } = plan

  // ---------- Track every shot ----------
  // Only on a hole of a round that started with tracking on. A shot starts at the ball (GPS when following,
  // else the marker) with the club on screen, and finishes at the next Shot tap or at Hole done.
  const holeNumber = hole?.ref ?? null
  const trackingOn = !!roundHere?.trackShots && holeNumber != null && roundHere.holes.some((h) => h.hole_number === holeNumber)
  const roundShots = roundHere?.shots ?? []
  const shotClub = chosen?.club ?? (clubChoice === "auto" ? null : choiceClub(clubChoice))
  // A shot added to fill a gap: the golfer drags its start point on the map until Done.
  const [split, setSplit] = useState<{ holeNumber: number; firstShot: number } | null>(null)
  const canTapShot = trackingOn && !!pin && !!lies && !!ball && !split

  function tapShot() {
    if (!canTapShot || !roundHere || holeNumber == null || !pin || !lies || !ball) return
    const shots = recordShot(roundShots, {
      holeNumber,
      club: shotClub ?? UNKNOWN_CLUB,
      clubConfirmed: clubChoice !== "auto",
      at: ball,
      atLie: startLie,
      pin,
    })
    changeRound({ ...roundHere, shots })
  }

  const lastShot = trackingOn && holeNumber != null ? lastShotOn(roundShots, holeNumber) : null
  function editLastShot(patch: Parameters<typeof editShot>[3]) {
    if (roundHere && holeNumber != null && lastShot) changeRound({ ...roundHere, shots: editShot(roundShots, holeNumber, lastShot.shotNumber, patch) })
  }
  function deleteLastShot() {
    if (roundHere && holeNumber != null && lastShot) changeRound({ ...roundHere, shots: deleteShot(roundShots, holeNumber, lastShot.shotNumber) })
  }
  /** "Missed a shot? Add one": splits the last shot at its midpoint and lets the golfer drag that point. */
  function addMissedShot() {
    if (!roundHere || holeNumber == null || !lastShot || !ball || !lies) return
    changeRound({ ...roundHere, shots: addShotAtMidpoint(roundShots, holeNumber, lastShot.shotNumber, ball, (p) => lies.lieAt(p)) })
    setSplit({ holeNumber, firstShot: lastShot.shotNumber })
  }
  const splitPoint = split ? (roundShots.find((s) => s.holeNumber === split.holeNumber && s.shotNumber === split.firstShot)?.to ?? null) : null
  function moveSplitPoint(p: LatLng) {
    if (!roundHere || !split || !lies) return
    changeRound({ ...roundHere, shots: moveSplit(roundShots, split.holeNumber, split.firstShot, p, lies.lieAt(p)) })
  }

  // Each bag club's mean total (carry plus roll), for the "longer than your 7-Iron goes" check. Only worked out while tracking.
  const totalByClub = useMemo(
    () =>
      trackingOn
        ? new Map(
            buildBagNumbers({
              bag,
              fits: source === "calibrated" ? (myProfile?.fits ?? null) : null,
              handicap,
              accountHandicap: trackedHandicap ?? baseline?.handicapIndex ?? null,
              typed: typedCarries(driverCarry, sevenIronCarry, extraCarries),
            }).map((r) => [r.club, r.totalYds] as const)
          )
        : new Map<string, number>(),
    [trackingOn, bag, source, myProfile, handicap, trackedHandicap, baseline, driverCarry, sevenIronCarry, extraCarries]
  )
  /** Where the ball is for "Hole done": the position and the lie under it. */
  const holeBall: BallNow | null = ball && lies ? { at: ball, lie: lies.lieAt(ball) } : null

  // "No OB mapped on this hole": nothing beside the hole's line counts as out of bounds and the golfer hasn't said.
  const holeObTags = obTags.tagsFor(holeId)
  const noObMapped = useMemo(
    () => !!hole && !!lies && !hasAnswered(holeObTags) && !hasOobBesideLine(hole.line, lies),
    [hole, lies, holeObTags]
  )

  function setHazardConfirmed(hazard: ConfirmableHazard, value: boolean) {
    zoneState.setHazardConfirmed(hazard, value, hole)
  }

  async function submitHoleCorrection(input: HoleCorrectionSubmission) {
    await geo.submitHoleCorrection(input, { hole })
  }

  function pickHole(h: CourseHole, features = geometry?.features ?? []) {
    setHoleId(h.id)
    setBall(h.line[0])
    dispatchAim({ type: "reset" })
    setPinManual(null)
    setClubChoiceRaw((prev) => choiceAfterHolePick(prev, holeId, h.id)) // the same hole keeps a picked club
    // Turn the map so the tee is at the bottom and the green at the top, and frame the hole's line, fairway and green.
    const pinPoint = holePinForFeatures(h, features)
    setFit({ points: holeFitPoints(h, features, pinPoint), bearingDeg: bearingDeg(h.line[0], pinPoint), key: `hole-${h.id}` })
    updateLastPositionHole(h.id)
  }

  function useMyLocation() {
    ballState.useMyLocation(pin)
  }

  // "Hole 8" for the arrows' tooltips.
  const holeLabel = (offset: 1 | -1) => {
    const h = neighbourHole(offset)
    return h ? `Hole ${h.ref ?? "?"}` : ""
  }

  const hasCourseProblems = !!geometry && (geometry.scope === "radius" || holes.length === 0 || (holes.length > 0 && stats.greens === 0))

  // The header: "H7 · P3 · 108" (never cut off) and the short course name after it (cut off first). Tapping opens the course/hole sheet.
  const holeYards = hole ? hole.yardageYds ?? (pin ? Math.round(distanceYds(hole.line[0], pin)) : null) : null
  const holeTitle = !course
    ? loadState === "loading"
      ? "Loading course…"
      : "Find a course"
    : hole
      ? [`H${hole.ref ?? "?"}`, ...(hole.par ? [`P${hole.par}`] : []), ...(holeYards != null ? [String(holeYards)] : [])].join(" · ")
      : holes.length > 0
        ? "Pick a hole"
        : shortCourseName(course.name)
  // Pebble Beach is only the first-visit demo: say so until the golfer signs in or sets a home course.
  const isDemo = !authUser && !homeChosen && !baseline?.homeCourse && course?.id === DEFAULT_COURSE.id
  const headerCourseName = course && hole ? (isDemo ? "Demo · " : "") + shortCourseName(course.name) : ""

  return {
    mapTapGuardUntil,
    offlineReport,
    roundSheet, setRoundSheet, holeOffer: nextHoleOffer.offer, answerHoleOffer,
    loadNeedsSignIn, searchError,
    addDrawPoint, aim, aimAtBest, aimLie, aimState, atBestAim, authUser, avgLeft, bag,
    bagDriverCarry, ball, baselineHandicap, best, cancelDraw, changeRound, holeTitle, headerCourseName,
    chooseCourse, firstRun, startDemo, finishFirstRun, chosen, chosenAtAim, chosenLive, clubChoice, correctionNote, correctionSubmitting, course,
    deleteZone, distPin, drawKind, driverCarry, editingHole, estimateNotes, extraCarries, finishDraw,
    fit, following, fromLabel, geometry, goToHoleNumber, gpsAccuracyYds, gpsError, gpsNote, handicap,
    hasCourseProblems, hits, hole, holeBearingDeg, holeId, holeLabel, holeQuality, holes, hydrated,
    initialZoom, labels, landings, layersMenuPos, layersMenuRef, loadCourse, loadError, loadState,
    mapWrapRef, moveBallTo, pendingPoints, pickClub, pickHole, pickerOpen, pin,
    placing, planReady, query, rankState, ranking, rankingPending, recent, refreshCourseData,
    refreshing, ellipse, round, roundHere, scoreBaseline, searched, searching, dispatchAim,
    setClubChoice, setDriverCarry, setEditingHole, setHandicap, setHazardConfirmed, setLayersMenuPos,
    setPickerOpen, setPinManual, setPlacing, setQuery, setSevenIronCarry, setSheetOpen,
    setShowCarry, setShowLayersMenu, setShowMarks, setShowEllipse, setShowTrouble,
    setShowZones, setSource, setTendency, sevenIronCarry, sheetOpen, showCarry, showLayersMenu, showMarks,
    showEllipse, showTrouble, showZones, shownLies, source, startDraw, stats, stepHole,
    stopFollowing, submitHoleCorrection, tendency, toggleClub,
    toggleFollow, troubleCells, undoDrawPoint, useMyLocation, zones,
    optionsNote, strategyMode, obBands, obTags, holeObTags, noObMapped,
    trackingOn, canTapShot, tapShot, shotClub, lastShot, editLastShot, deleteLastShot, addMissedShot, totalByClub, holeBall,
    split, setSplit, splitPoint, moveSplitPoint,
    pinPlaysLike, greenYards, greenLabel, coldTip, wind, playsLikeOn, setPlaysLikeOn, hasElevation,
    onCourseSpread: settings.onCourseSpread,
  }
}

export type PlannerVM = ReturnType<typeof usePlannerController>
