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
  const [ball, setBall] = useState<LatLng | null>(null)
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
  const [following, setFollowing] = useState(false)
  const [gpsAccuracyYds, setGpsAccuracyYds] = useState<number | null>(null)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const watchId = useRef<number | null>(null)
  const lastFollowAt = useRef(0)
  const [gpsError, setGpsError] = useState("")
  // Why the last GPS reading didn't move the ball (weak signal, or a jump), until one does.
  const [gpsNote, setGpsNote] = useState("")
  const gpsTrack = useRef<GpsTrack>(EMPTY_TRACK) // the readings that moved the ball while following, for judging the next
  const [fit, setFit] = useState<{ bounds: [[number, number], [number, number]] | null; key: string }>({
    bounds: null,
    key: "none",
  })

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

  // Stop GPS following when leaving the page.
  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

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

  // ---------- hole selection ----------
  const holes = geometry?.holes ?? []
  const hole: CourseHole | null = holes.find((h) => h.id === holeId) ?? null
  // The round in progress, when it's at the course that's open.
  const roundHere = round && course && round.course.id === course.id ? round : null
  const scoring = !!roundHere && playView === "score"

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

  // Memoized so its reference only changes when the underlying pin genuinely
  // moves -- holePinFor can return a freshly-built point (nearest green
  // centroid), and several effects below tell "a new stance" from "just
  // re-rendered" by reference, which an unstable pin would break.
  const pin: LatLng | null = useMemo(
    () => pinManual ?? (hole ? holePinFor(hole) : null),
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

  function setHazardConfirmed(hazard: ConfirmableHazard, value: boolean) {
    zoneState.setHazardConfirmed(hazard, value, hole)
  }

  // "estimated" only happens when neither OSM nor a hand-drawn zone has a
  // fairway for this hole -- fill in a corridor so club/aim scoring has
  // something to work with instead of treating the whole hole as rough.
  const fairwayEstimated = holeQuality?.fairway === "estimated"
  const corridor: CourseFeature | null = useMemo(
    () => (hole && geometry && fairwayEstimated ? estimatedFairwayCorridor(hole, holePinFor(hole)) : null),
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

  async function submitHoleCorrection(input: HoleCorrectionSubmission) {
    await geo.submitHoleCorrection(input, { supabase, authUser, hole, onApplied: applyGeometry })
  }

  function stopFollowing() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setFollowing(false)
    setGpsAccuracyYds(null)
    setGpsNote("")
    gpsTrack.current = EMPTY_TRACK
  }

  function fixFrom(pos: GeolocationPosition): GpsFix {
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyYds: Math.round(pos.coords.accuracy * YD_PER_M),
      t: pos.timestamp || Date.now(),
    }
  }

  // Every ball move asks for the best club again; a club picked to check its
  // numbers only holds until the ball moves.
  function moveBallTo(p: LatLng) {
    setBall(p)
    setClubChoice("auto")
  }

  // Keeps the ball on your live GPS position (about every 2.5 s) so the yardages
  // update as you walk -- but only on readings worth trusting (lib/course/gps.ts):
  // within 20 yd, and no faster than a cart could have taken you there.
  function toggleFollow() {
    if (following) {
      stopFollowing()
      return
    }
    setGpsError("")
    setGpsNote("")
    if (!navigator.geolocation) {
      setGpsError("This browser has no location access.")
      return
    }
    gpsTrack.current = EMPTY_TRACK
    setFollowing(true)
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastFollowAt.current < 2500) return
        const next = fixFrom(pos)
        setGpsAccuracyYds(next.accuracyYds)
        const { verdict, track } = judgeFix(gpsTrack.current, next)
        gpsTrack.current = track
        if (verdict === "inaccurate") {
          setGpsNote(`Weak GPS signal (±${next.accuracyYds} yd). Ball not moved.`)
          return
        }
        if (verdict === "jump") {
          setGpsNote("GPS jumped. Ball not moved until it settles.")
          return
        }
        lastFollowAt.current = now
        setGpsNote("")
        moveBallTo({ lat: next.lat, lng: next.lng })
      },
      (err) => {
        setGpsError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.")
        stopFollowing()
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    )
  }

  // One tap: waits up to 10 s for a reading within 20 yd (the first one a
  // phone reports is often a coarse guess), then moves the ball there once.
  function useMyLocation() {
    setGpsError("")
    setGpsNote("")
    if (!navigator.geolocation) {
      setGpsError("This browser has no location access.")
      return
    }
    let best: GpsFix | null = null
    let done = false
    const finish = (id: number) => {
      done = true
      navigator.geolocation.clearWatch(id)
      clearTimeout(timer)
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (done) return
        const next = fixFrom(pos)
        if (!best || next.accuracyYds < best.accuracyYds) best = next
        if (judgeFix(EMPTY_TRACK, next).verdict !== "accept") {
          setGpsNote(`Finding you… ±${next.accuracyYds} yd so far.`)
          return
        }
        finish(id)
        setGpsNote("")
        const p = { lat: next.lat, lng: next.lng }
        moveBallTo(p)
        setFit({ bounds: boundsOf([p, ...(pin ? [pin] : [])]), key: `gps-${Date.now()}` })
      },
      (err) => {
        if (done) return
        finish(id)
        setGpsNote("")
        setGpsError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.")
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    )
    const timer = setTimeout(() => {
      if (done) return
      finish(id)
      setGpsNote(
        best
          ? `Weak GPS signal (±${best.accuracyYds} yd). Ball not moved; tap the map to place it.`
          : "No GPS fix yet. Tap the map to place the ball."
      )
    }, 10000)
  }

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
