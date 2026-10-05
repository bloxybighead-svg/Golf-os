"use client"

// Everything the Play planner page does apart from drawing it: the hooks
// (settings, course, zones, ball, plan), the page's own toggles, start-up
// (resume the last course or round) and the moves that touch several hooks at
// once -- loading a course, picking a hole. Moved verbatim from
// CourseMapClient.tsx; PlannerView draws what this returns.

import { useEffect, useMemo, useRef, useState } from "react"
import type { PlannerProps as Props } from "@/lib/planner/types"
import { bearingDeg, distanceYds, type LatLng } from "@/lib/course/geo"
import type { FitRequest } from "@/lib/planner/orientation"
import { type ConfirmableHazard } from "@/lib/course/dataQuality"
import { type CourseHole } from "@/lib/course/overpass"
import type { Club } from "@/lib/golfer/tables"
import { type HoleCorrectionSubmission } from "@/components/simulator/EditHoleModal"
import { type PlayView } from "@/components/play/PlayRound"
import { loadActiveRound, nextUnscored, saveActiveRound, type ActiveRound } from "@/lib/rounds/activeRound"
import { type Placing } from "@/components/simulator/courseColors"
import { shortCourseName } from "@/lib/planner/labels"
import { choiceAfterHolePick } from "@/lib/planner/clubChoice"
import { DEFAULT_COURSE, DEFAULT_HOLE_REF, loadLastPosition, loadNoHazard, loadZoom, saveLastPosition, updateLastPositionHole, type CourseHit } from "@/lib/planner/storage"
import { holeFitPoints, holePinFor as holePinForFeatures } from "@/lib/planner/geometry"
import { usePlannerSettings } from "@/hooks/usePlannerSettings"
import { useAuthUser } from "@/hooks/useAuthUser"
import { useCourseGeometry, type AutoHole, type OnGeometryApplied } from "@/hooks/useCourseGeometry"
import { useZones } from "@/hooks/useZones"
import { useBallPosition } from "@/hooks/useBallPosition"
import { usePlan } from "@/hooks/usePlan"
import { useObTags } from "@/hooks/useObTags"
import { hasOobBesideLine } from "@/lib/course/obTags"
import { hasAnswered } from "@/lib/planner/obTagStore"
import { kvDelete, kvGet, kvSet } from "@/lib/offline/db"
import { prefetchForRound, type PrefetchReport } from "@/lib/offline/snapshots"

/** The round in progress, copied into IndexedDB on every tap (localStorage has it too; this one survives more). */
const ACTIVE_ROUND_IDB_KEY = "activeRound"

export function usePlannerController({ calibrated, myProfile = null, trackedHandicap, baseline }: Props) {
  const { supabase, authUser } = useAuthUser()

  // --- course search / loading ---
  const geo = useCourseGeometry()
  const {
    query, setQuery, hits, setHits, searching, searched, course, setCourse, geometry, setGeometry, loadState,
    setLoadState, loadError, setLoadError, refreshing, initialZoom, setInitialZoom, editingHole,
    setEditingHole, correctionSubmitting, correctionNote, loadNeedsSignIn, searchError,
  } = geo

  // --- golfer (whose shots, bag, carries; saved on this device) ---
  const settings = usePlannerSettings({ calibrated, myProfile, baseline })
  const {
    source, setSource, handicap, setHandicap, driverCarry, setDriverCarry, sevenIronCarry, setSevenIronCarry,
    tendency, setTendency, extraCarries, showSetupPrompt, setShowSetupPrompt, bag, compareAgainst, recent,
    hydrated, remember,
  } = settings
  // A round being scored (kept on the device) and which side of it is showing.
  const [round, setRound] = useState<ActiveRound | null>(null)
  const [playView, setPlayView] = useState<PlayView>("map")

  // --- positions ---
  const [holeId, setHoleId] = useState<string | null>(null)
  const [aimManual, setAimManual] = useState<LatLng | null>(null)
  const [pinManual, setPinManual] = useState<LatLng | null>(null)
  const [placing, setPlacing] = useState<Placing>("ball")
  const [clubChoice, setClubChoice] = useState<string>("auto")
  const zoneState = useZones({ supabase, authUser, course })
  const {
    zones, noHazard, setNoHazard, localOnlyZones, setLocalOnlyZones, syncingZones, drawKind, setDrawKind,
    pendingPoints, setPendingPoints, loadZonesFor, syncLocalZonesToAccount, startDraw, addDrawPoint,
    undoDrawPoint, cancelDraw, finishDraw, deleteZone,
  } = zoneState
  const [showTrouble, setShowTrouble] = useState(false)
  const [showRings, setShowRings] = useState(true)
  const [showCarry, setShowCarry] = useState(false) // dots are where shots stop; this adds where they landed
  const [showZones, setShowZones] = useState(true)
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
  const ballState = useBallPosition({ setFit })
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
    setAimManual(null)
    setPinManual(null)
    setDrawKind(null)
    setPendingPoints([])
    void loadZonesFor(c)
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
    setRound(next)
    saveActiveRound(next)
    void (next ? kvSet(ACTIVE_ROUND_IDB_KEY, next) : kvDelete(ACTIVE_ROUND_IDB_KEY))
  }
  function changePlayView(v: PlayView) {
    setPlayView(v)
    // The map was hidden, not unmounted: have Leaflet re-measure itself.
    if (v === "map") setTimeout(() => window.dispatchEvent(new Event("resize")), 0)
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
  const scoring = !!roundHere && playView === "score"

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
    onCourseSpread: settings.onCourseSpread,
    obTags: obTags.tagsFor(holeId),
    roundActive: !!roundHere,
  })
  const {
    aim, aimAtBest, aimIsPin, aimToPin, atBestAim, avgLeft, bagDriverCarry, baselineHandicap, best, chosen,
    chosenAtAim, chosenLive, distAim, distPin, estimateNotes, fromLabel, holeBearingDeg, holeQuality, labels,
    landings, longestCarry, pickClub, pin, planReady, rankState, ranking, rankingPending, rings,
    scoreBaseline, shownLies, stats, troubleCells, optionsNote, obBands, lies,
    pinPlaysLike, wind, playsLikeOn, setPlaysLikeOn, hasElevation,
  } = plan

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
    await geo.submitHoleCorrection(input, { supabase, authUser, hole, onApplied: applyGeometry })
  }

  function pickHole(h: CourseHole, features = geometry?.features ?? []) {
    setHoleId(h.id)
    setBall(h.line[0])
    setAimManual(null)
    setPinManual(null)
    setClubChoice((prev) => choiceAfterHolePick(prev, holeId, h.id)) // the same hole keeps a picked club
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
  const headerCourseName = course && hole ? shortCourseName(course.name) : ""

  return {
    mapTapGuardUntil,
    offlineReport,
    loadNeedsSignIn, searchError,
    addDrawPoint, aim, aimAtBest, aimIsPin, aimManual, aimToPin, atBestAim, authUser, avgLeft, bag,
    bagDriverCarry, ball, baselineHandicap, best, cancelDraw, changePlayView, changeRound, holeTitle, headerCourseName,
    chooseCourse, chosen, chosenAtAim, chosenLive, clubChoice, correctionNote, correctionSubmitting, course,
    deleteZone, distAim, distPin, drawKind, driverCarry, editingHole, estimateNotes, extraCarries, finishDraw,
    fit, following, fromLabel, geometry, goToHoleNumber, gpsAccuracyYds, gpsError, gpsNote, handicap,
    hasCourseProblems, hits, hole, holeBearingDeg, holeId, holeLabel, holeQuality, holes, hydrated,
    initialZoom, labels, landings, layersMenuPos, layersMenuRef, loadCourse, loadError, loadState,
    localOnlyZones, longestCarry, mapWrapRef, moveBallTo, pendingPoints, pickClub, pickHole, pickerOpen, pin,
    placing, planReady, playView, query, rankState, ranking, rankingPending, recent, refreshCourseData,
    refreshing, rings, round, roundHere, scoreBaseline, scoring, searched, searching, setAimManual,
    setClubChoice, setDriverCarry, setEditingHole, setHandicap, setHazardConfirmed, setLayersMenuPos,
    setLocalOnlyZones, setPickerOpen, setPinManual, setPlacing, setQuery, setSevenIronCarry, setSheetOpen,
    setShowCarry, setShowLayersMenu, setShowMarks, setShowRings, setShowSetupPrompt, setShowTrouble,
    setShowZones, setSource, setTendency, sevenIronCarry, sheetOpen, showCarry, showLayersMenu, showMarks,
    showRings, showSetupPrompt, showTrouble, showZones, shownLies, source, startDraw, stats, stepHole,
    stopFollowing, submitHoleCorrection, syncLocalZonesToAccount, syncingZones, tendency, toggleClub,
    toggleFollow, troubleCells, undoDrawPoint, useMyLocation, zones,
    optionsNote, obBands, obTags, holeObTags, noObMapped,
    pinPlaysLike, wind, playsLikeOn, setPlaysLikeOn, hasElevation,
    onCourseSpread: settings.onCourseSpread,
  }
}

export type PlannerVM = ReturnType<typeof usePlannerController>
