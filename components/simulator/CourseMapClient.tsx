"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Layers, Loader2, RefreshCw, RotateCcw, Undo2, X } from "lucide-react"
import dynamic from "next/dynamic"
import {
  bearingDeg,
  distanceYds,
  ringCentroid,
  type LatLng,
} from "@/lib/course/geo"
import { defaultTeeAim } from "@/lib/course/aim"
import { EMPTY_TRACK, judgeFix, type GpsFix, type GpsTrack } from "@/lib/course/gps"
import type { StartLie } from "@/lib/course/cost"
import {
  applyConfirmedAbsent,
  assessHoleDataQuality,
  boundaryStatus,
  estimatedFairwayCorridor,
  type ConfirmableHazard,
  type HoleDataQuality,
  type SurfaceStatus,
} from "@/lib/course/dataQuality"
import { buildValueGrid, deltaColor, dispersionRing } from "@/lib/course/heatmap"
import type { Lie, UserZone } from "@/lib/course/lies"
import { GEOMETRY_VERSION, type CourseFeature, type CourseGeometry, type CourseHole } from "@/lib/course/overpass"
import {
  aimMarkerFor,
  aimOffsetLabel,
  evaluateClub,
  flagsUnmapped,
  isAtBestAim,
  isTie,
  simulateLandings,
  strokesAtAim,
  type ClubShots,
  type OptimizedClubPlan,
} from "@/lib/course/plan"
import { buildLieMapFrom, type LieInputs } from "@/lib/course/rankRequest"
import {
  COMPARE_AGAINST_EVENT,
  COMPARE_AGAINST_KEY,
  DEFAULT_BASELINE_HANDICAP,
  getBaseline,
  readCompareAgainst,
  type CompareAgainst,
} from "@/lib/course/baseline"
import { useClubRanking, type RankingRequest } from "./useClubRanking"
import { seededSample } from "@/lib/dispersion/stats"
import { generateCustomGolferShots, type Tendency } from "@/lib/golfer/build"
import type { Club } from "@/lib/golfer/tables"
import { CALIBRATED_DEFAULT_BAG, CLUB_CATALOG, DEFAULT_BAG, fillBag, normalizeBag } from "@/lib/golfer/bag"
import {
  LAST_POSITION_KEY,
  ONBOARDED_KEY,
  SETTINGS_KEY,
  applyBaselineToDevice,
  cleanCarries,
  type Baseline,
} from "@/lib/golfer/baseline"
import { createClient } from "@/lib/supabase/client"
import { TendencyPicker } from "./TendencyPicker"
import { EditHoleModal, type HoleCorrectionSubmission } from "./EditHoleModal"
import { TeeLine } from "./TeeLine"
import { PlayRound, type PlayView } from "@/components/play/PlayRound"
import { loadActiveRound, nextUnscored, saveActiveRound, type ActiveRound } from "@/lib/rounds/activeRound"
import { lieColor, type Placing } from "./courseColors"
import { cssColor } from "@/lib/theme/tokens"
import { ALWAYS_SHOWN, DRAW_KINDS, LIE_LABEL, LIE_SHORT, LIES, pct, shortCourseName, STATUS_TITLE } from "@/lib/planner/labels"
import {
  COURSE_CACHE_MAX_AGE_MS,
  DEFAULT_COURSE,
  DEFAULT_HOLE_REF,
  loadLastPosition,
  loadNoHazard,
  loadZones,
  loadZoom,
  RECENT_KEY,
  saveLastPosition,
  saveNoHazard,
  saveZones,
  saveZoom,
  updateLastPositionHole,
  type CourseHit,
  type NoHazardMap,
} from "@/lib/planner/storage"
import { boundsOf, holePinFor as holePinForFeatures } from "@/lib/planner/geometry"
import { LayerMenuItem, Stat, ToolButton } from "@/components/planner/ui"
import { ScoringDetails } from "@/components/planner/ScoringDetails"
import { ClubTable } from "@/components/planner/ClubTable"
import { ResultCard } from "@/components/planner/ResultCard"
import { LayersMenu } from "@/components/planner/LayersMenu"
import { HoleHeader } from "@/components/planner/HoleHeader"
import { ClubSheet } from "@/components/planner/ClubSheet"
import { CoursePickerSheet } from "@/components/planner/CoursePickerSheet"
import { MapView } from "@/components/planner/MapView"
import { usePlannerSettings } from "@/hooks/usePlannerSettings"
import { useAuthUser } from "@/hooks/useAuthUser"
import { useCourseGeometry, type AutoHole, type OnGeometryApplied } from "@/hooks/useCourseGeometry"
import { useZones } from "@/hooks/useZones"
import { useBallPosition } from "@/hooks/useBallPosition"
import { usePlan } from "@/hooks/usePlan"

const CourseMap = dynamic(() => import("./CourseMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-muted">Loading map…</div>,
})

export interface CalibratedClub {
  club: string
  meanCarryYds: number
  shots: { carryYds: number; offlineYds: number }[]
}

interface Props {
  calibrated: CalibratedClub[] | null
  calibratedName: string
  /** The signed-in golfer's latest tracked handicap, for the tee recommendation. */
  trackedHandicap: number | null
  /** The signed-in golfer's setup numbers, applied the first time Play opens on a device. */
  baseline: Baseline | null
}


const DOTS_SHOWN = 400
const HANDICAP_SHOTS_PER_CLUB = 1000
const YD_PER_M = 1.09361


export function CourseMapClient({ calibrated, calibratedName, trackedHandicap, baseline }: Props) {
  const { supabase, authUser } = useAuthUser()

  // --- course search / loading ---
  const geo = useCourseGeometry()
  const {
    query,
    setQuery,
    hits,
    setHits,
    searching,
    searched,
    course,
    setCourse,
    geometry,
    setGeometry,
    loadState,
    setLoadState,
    loadError,
    setLoadError,
    refreshing,
    initialZoom,
    setInitialZoom,
    editingHole,
    setEditingHole,
    correctionSubmitting,
    correctionNote,
  } = geo

  // --- golfer (whose shots, bag, carries; saved on this device) ---
  const settings = usePlannerSettings({ calibrated, baseline })
  const {
    source,
    setSource,
    handicap,
    setHandicap,
    driverCarry,
    setDriverCarry,
    sevenIronCarry,
    setSevenIronCarry,
    tendency,
    setTendency,
    extraCarries,
    showSetupPrompt,
    setShowSetupPrompt,
    bag,
    compareAgainst,
    recent,
    hydrated,
    remember,
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
    zones,
    noHazard,
    setNoHazard,
    localOnlyZones,
    setLocalOnlyZones,
    syncingZones,
    drawKind,
    setDrawKind,
    pendingPoints,
    setPendingPoints,
    loadZonesFor,
    syncLocalZonesToAccount,
    startDraw,
    addDrawPoint,
    undoDrawPoint,
    cancelDraw,
    finishDraw,
    deleteZone,
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
  // Rendered through a portal (see below), so its position is tracked in viewport
  // coordinates rather than relying on CSS positioning relative to an ancestor.
  const [layersMenuPos, setLayersMenuPos] = useState<{ top: number; left: number } | null>(null)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ bounds: [[number, number], [number, number]] | null; key: string }>({
    bounds: null,
    key: "none",
  })
  const ballState = useBallPosition({ setClubChoice, setFit })
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
    setFit({ bounds: boundsOf(pts.length ? pts : [{ lat: c.lat as number, lng: c.lng as number }]), key: `course-${c.id}` })
    const target = opts?.autoHoleId
      ? g.holes.find((h) => h.id === opts.autoHoleId)
      : opts?.autoHoleRef
        ? g.holes.find((h) => h.ref === opts.autoHoleRef)
        : opts?.autoFirstHole
          ? g.holes[0]
          : undefined
    if (target) pickHole(target)
  }

  async function fetchGeometry(c: CourseHit, opts?: { force?: boolean } & AutoHole) {
    await geo.fetchGeometry(c, opts, applyGeometry)
  }

  async function refreshCourseData() {
    await geo.refreshCourseData(applyGeometry)
  }

  function toggleClub(c: Club) {
    if (settings.toggleClub(c)) setClubChoice("auto")
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
  const scoring = !!roundHere && playView === "score"

  const plan = usePlan({
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
  })
  const {
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
  } = plan

  function setHazardConfirmed(hazard: ConfirmableHazard, value: boolean) {
    zoneState.setHazardConfirmed(hazard, value, hole)
  }

  async function submitHoleCorrection(input: HoleCorrectionSubmission) {
    await geo.submitHoleCorrection(input, { supabase, authUser, hole, onApplied: applyGeometry })
  }


  function holePinFor(h: CourseHole): LatLng {
    return holePinForFeatures(h, geometry?.features ?? [])
  }

  function pickHole(h: CourseHole) {
    setHoleId(h.id)
    setBall(h.line[0])
    setAimManual(null)
    setPinManual(null)
    setClubChoice("auto")
    setFit({ bounds: boundsOf([...h.line, holePinFor(h)]), key: `hole-${h.id}` })
    updateLastPositionHole(h.id)
  }

  function useMyLocation() {
    ballState.useMyLocation(pin)
  }

  // "Hole 8" for the arrows' tooltips.
  const holeIndex = holes.findIndex((h) => h.id === holeId)
  const holeLabel = (offset: 1 | -1) => {
    const h = neighbourHole(offset)
    return h ? `Hole ${h.ref ?? "?"}` : ""
  }

  const hasCourseProblems = !!geometry && (geometry.scope === "radius" || holes.length === 0 || (holes.length > 0 && stats.greens === 0))

  // The one-line title: "Pebble Beach · Hole 7 · Par 3 · 108". Tapping it opens the course/hole sheet.
  const holeYards = hole ? hole.yardageYds ?? (pin ? Math.round(distanceYds(hole.line[0], pin)) : null) : null
  const chipParts = course
    ? [
        shortCourseName(course.name),
        ...(hole
          ? [`Hole ${hole.ref ?? "?"}`, ...(hole.par ? [`Par ${hole.par}`] : []), ...(holeYards != null ? [String(holeYards)] : [])]
          : holes.length > 0
            ? ["Pick a hole"]
            : []),
      ]
    : [loadState === "loading" ? "Loading course…" : "Find a course"]

  const planCard =
    best && chosen && chosenLive ? (
      <ResultCard
        best={best}
        chosen={chosen}
        chosenLive={chosenLive}
        clubChoice={clubChoice}
        fromLabel={fromLabel}
        hole={hole}
        baselineHandicap={baselineHandicap}
        atBestAim={atBestAim}
        chosenAtAim={chosenAtAim}
        distAim={distAim}
        distPin={distPin}
        aimToPin={aimToPin}
        aimIsPin={aimIsPin}
        avgLeft={avgLeft}
        estimatedFrom={estimatedFrom}
        holeQuality={holeQuality}
        geometry={geometry}
        onEditHole={() => setEditingHole(true)}
        onStartDraw={startDraw}
        onConfirmHazard={setHazardConfirmed}
        onAimAtBest={aimAtBest}
        onBackToBest={() => {
          setClubChoice("auto")
          aimAtBest(best)
        }}
      />
    ) : null

  // No hole lines to stand on: the golfer places the ball and pin by hand.
  const placePrompt =
    course && geometry && !planReady ? (
      <p className="py-2 text-sm text-fg-3">{!ball ? "Tap the map to place the ball." : "Now tap to place the pin."}</p>
    ) : null

  const clubTable = (
    <ClubTable
      ranking={ranking}
      pending={rankingPending}
      rankMs={rankState.ms}
      shownLies={shownLies}
      best={best}
      chosen={chosen}
      estimatedFrom={estimatedFrom}
      baselineLabel={scoreBaseline.label}
      onPick={(r) => {
        pickClub(r)
        setSheetOpen(false)
      }}
    />
  )

  const scoringDetails = <ScoringDetails baselineHandicap={baselineHandicap} />

  const layersMenu = showLayersMenu && layersMenuPos && (
    <LayersMenu
      pos={layersMenuPos}
      onClose={() => setShowLayersMenu(false)}
      onMyLocation={useMyLocation}
      onToggleFollow={toggleFollow}
      following={following}
      gpsAccuracyYds={gpsAccuracyYds}
      gpsNote={gpsNote}
      showTrouble={showTrouble}
      onToggleTrouble={() => setShowTrouble((v) => !v)}
      showRings={showRings}
      onToggleRings={() => setShowRings((v) => !v)}
      showCarry={showCarry}
      onToggleCarry={() => setShowCarry((v) => !v)}
      hasZones={zones.length > 0}
      showZones={showZones}
      onToggleZones={() => setShowZones((v) => !v)}
      drawKind={drawKind}
      onStartDraw={startDraw}
    />
  )

  const pickerSheet = pickerOpen && (
    <CoursePickerSheet
      onClose={() => setPickerOpen(false)}
      query={query}
      onQueryChange={setQuery}
      searching={searching}
      searched={searched}
      hits={hits}
      onChooseCourse={chooseCourse}
      course={course}
      holes={holes}
      holeId={holeId}
      onPickHole={pickHole}
      recent={recent}
      calibrated={calibrated}
      calibratedName={calibratedName}
      source={source}
      onSourceChange={(v) => {
        setSource(v)
        setClubChoice("auto")
      }}
      handicap={handicap}
      onHandicapChange={setHandicap}
      driverCarry={driverCarry}
      onDriverCarryChange={setDriverCarry}
      sevenIronCarry={sevenIronCarry}
      onSevenIronCarryChange={setSevenIronCarry}
      tendency={tendency}
      onTendencyChange={setTendency}
      extraCarries={extraCarries}
      bag={bag}
      onToggleClub={toggleClub}
      estimatedFrom={estimatedFrom}
      geometry={geometry}
      stats={stats}
      hasCourseProblems={hasCourseProblems}
      refreshing={refreshing}
      onRefresh={refreshCourseData}
    />
  )

  const mapContent =
    course?.lat != null && course.lng != null ? (
      <CourseMap
        center={{ lat: course.lat, lng: course.lng }}
        geometry={geometry}
        selectedHoleId={holeId}
        ball={ball}
        aim={aim}
        pin={pin}
        landings={landings}
        showCarry={showCarry}
        cells={troubleCells}
        rings={rings}
        zones={showZones ? zones : []}
        drawKind={drawKind}
        pendingPoints={pendingPoints}
        labels={labels}
        placing={placing}
        fitBounds={fit.bounds}
        fitKey={fit.key}
        initialZoom={initialZoom}
        onZoomChange={(z) => course && saveZoom(course.id, z)}
        holeBearingDeg={holeBearingDeg}
        onBall={(p) => {
          stopFollowing()
          moveBallTo(p)
          if (!pin) setPlacing("pin") // no hole to take a pin from: the next tap places it
        }}
        onAim={(p) => {
          setAimManual(p)
        }}
        onPin={(p) => {
          setPinManual(p)
        }}
        onPickHole={(id) => {
          const h = holes.find((x) => x.id === id)
          if (h) pickHole(h)
        }}
        onDrawPoint={addDrawPoint}
        onDrawClose={finishDraw}
      />
    ) : (
      <div className="flex h-full items-center justify-center">
        {loadState === "loading" && !course ? (
          <Loader2 size={20} className="animate-spin text-muted" />
        ) : (
          <button
            onClick={() => setPickerOpen(true)}
            className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent"
          >
            Find a course
          </button>
        )}
      </div>
    )

  return (
    <div className="space-y-3">
      {showSetupPrompt && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-fg/[0.08] bg-surface py-1 pl-3 pr-1 text-sm">
          <span className="text-fg-2">Plan with your own clubs.</span>
          <span className="flex shrink-0 items-center">
            <Link href="/welcome" className="flex h-11 items-center px-3 font-semibold text-accent hover:underline">
              Set up
            </Link>
            <button
              onClick={() => {
                setShowSetupPrompt(false)
                try {
                  localStorage.setItem(ONBOARDED_KEY, "dismissed")
                } catch {
                  /* it just comes back next visit */
                }
              }}
              aria-label="Dismiss"
              className="flex h-11 w-11 items-center justify-center text-muted hover:text-fg"
            >
              <X size={16} />
            </button>
          </span>
        </div>
      )}

      {/* ---- title: one tappable line that opens the course/hole sheet, plus previous/next hole ---- */}
      <HoleHeader
        title={chipParts.join(" · ")}
        onOpenPicker={() => setPickerOpen(true)}
        showArrows={holes.length > 1}
        onStep={stepHole}
        holeLabel={holeLabel}
      />

      {loadState === "loading" && course && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Loader2 size={12} className="animate-spin" /> {loadError || "Loading course…"}
        </p>
      )}
      {loadState === "error" && course && (
        <p className="text-xs text-danger">
          {loadError}{" "}
          <button onClick={() => loadCourse(course, { autoFirstHole: true })} className="font-semibold underline">
            Retry
          </button>
        </p>
      )}
      {loadState === "idle" && loadError && <p className="text-xs text-muted">{loadError}</p>}

      {course && loadState !== "error" && !roundHere && (
        <TeeLine
          courseId={course.id}
          courseName={course.name}
          driverCarryYds={bagDriverCarry ?? (longestCarry > 0 ? longestCarry : null)}
          handicapIndex={source === "handicap" ? handicap : trackedHandicap}
        />
      )}

      {course && loadState !== "error" && hydrated && (
        <PlayRound
          course={course}
          courseHoles={holes}
          currentHole={hole?.ref ?? null}
          round={round}
          onRoundChange={changeRound}
          view={playView}
          onViewChange={changePlayView}
          onGoToHole={goToHoleNumber}
          onResume={(c, n) => void loadCourse(c, { autoHoleRef: n })}
          driverCarryYds={bagDriverCarry ?? (longestCarry > 0 ? longestCarry : null)}
          handicapIndex={source === "handicap" ? handicap : trackedHandicap}
          signedIn={!!authUser}
        />
      )}

      {/* Scoring a hole hides the map (kept mounted, so it comes back as it was). */}
      <div className={scoring ? "hidden" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]"}>
        {/* ---- map ---- (min-w-0 stops a wide child from stretching the page on phones) */}
        <MapView
          placing={placing}
          onPlacingChange={setPlacing}
          drawKind={drawKind}
          pendingPoints={pendingPoints}
          aimIsManual={!!aimManual}
          onResetAim={() => {
            setAimManual(null)
          }}
          layersRef={layersMenuRef}
          layersActive={showLayersMenu || showTrouble || following || !!drawKind}
          onLayersClick={() => {
            if (!showLayersMenu && layersMenuRef.current) {
              const r = layersMenuRef.current.getBoundingClientRect()
              setLayersMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 224) })
            }
            setShowLayersMenu((v) => !v)
          }}
          layersMenu={layersMenu}
          gpsError={gpsError}
          gpsNote={gpsNote}
          onUndoDraw={undoDrawPoint}
          onFinishDraw={finishDraw}
          onCancelDraw={cancelDraw}
          mapWrapRef={mapWrapRef}
          mapContent={mapContent}
          planReady={planReady}
          showTrouble={showTrouble}
          zones={zones}
          localOnlyZones={localOnlyZones}
          showMarks={showMarks}
          onToggleMarks={() => setShowMarks((v) => !v)}
          onSyncZones={syncLocalZonesToAccount}
          syncingZones={syncingZones}
          onDismissLocalZones={() => setLocalOnlyZones(null)}
          signedIn={!!authUser}
          onDeleteZone={deleteZone}
        />
        {/* ---- shot plan (tablet/desktop: everything inline, including the table) ---- */}
        <aside className="hidden min-w-0 space-y-3 md:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {placePrompt}
          {planCard}
          {planReady && ranking.length > 0 && clubTable}
          {planReady && scoringDetails}
        </aside>

        {/* ---- shot plan (phone: table moves into a bottom sheet so the map stays dominant) ---- */}
        <div className="min-w-0 space-y-3 md:hidden">
          {placePrompt}
          {planCard}
          {planReady && scoringDetails}
        </div>
      </div>

      {/* Phones: the club table. Collapsed, a chip above the tab bar; open, a
          full-screen list (it covers the map, so every club fits without a
          scroll fighting the map). Picking a club closes it. */}
      {planReady && ranking.length > 0 && !scoring && (
        <ClubSheet open={sheetOpen} onToggle={() => setSheetOpen((v) => !v)} chosen={chosen}>
          {clubTable}
        </ClubSheet>
      )}

      {pickerSheet}

      {editingHole && hole && course?.lat != null && course.lng != null && (
        <EditHoleModal
          hole={hole}
          defaultYardageYds={distanceYds(hole.line[0], hole.line[hole.line.length - 1])}
          courseCenter={{ lat: course.lat, lng: course.lng }}
          signedIn={!!authUser}
          submitting={correctionSubmitting}
          onClose={() => setEditingHole(false)}
          onSubmit={submitHoleCorrection}
        />
      )}
      {correctionNote && (
        <div className="fixed bottom-20 left-1/2 z-[1400] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-accent/30 bg-surface px-4 py-3 text-center text-sm text-fg shadow-2xl md:bottom-6">
          {correctionNote}
        </div>
      )}
    </div>
  )
}
