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
const SIDES = ["auto", "straight", "left", "right", "both"]
const STRENGTHS = ["slight", "moderate", "strong"]


export function CourseMapClient({ calibrated, calibratedName, trackedHandicap, baseline }: Props) {
  // --- course search / loading ---
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<CourseHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [course, setCourse] = useState<CourseHit | null>(null)
  const [geometry, setGeometry] = useState<CourseGeometry | null>(null)
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle")
  const [loadError, setLoadError] = useState("")
  const [refreshing, setRefreshing] = useState(false) // "Refresh course data": refetches geometry only, leaves ball/aim/pin alone
  const [initialZoom, setInitialZoom] = useState<number | undefined>(undefined) // remembered per course, initial view only
  const [editingHole, setEditingHole] = useState(false)
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false)
  const [correctionNote, setCorrectionNote] = useState<string | null>(null)

  // --- golfer ---
  const [source, setSource] = useState<"calibrated" | "handicap">(calibrated ? "calibrated" : "handicap")
  const [handicap, setHandicap] = useState(10)
  const [driverCarry, setDriverCarry] = useState("") // yards; blank = handicap average
  const [sevenIronCarry, setSevenIronCarry] = useState("")
  const [tendency, setTendency] = useState<Tendency>({ side: "auto", strength: "moderate" })
  // Carries for clubs beyond driver and 7-iron, from setup (/welcome).
  const [extraCarries, setExtraCarries] = useState<Partial<Record<Club, number>>>({})
  // First visit on this device with no setup yet: offer it, once.
  const [showSetupPrompt, setShowSetupPrompt] = useState(false)
  // A round being scored (kept on the device) and which side of it is showing.
  const [round, setRound] = useState<ActiveRound | null>(null)
  const [playView, setPlayView] = useState<PlayView>("map")
  // Which clubs are in the bag, per shot source (the calibrated golfer and a
  // handicap-based one carry different bags). Remembered on this device.
  const [bags, setBags] = useState<{ calibrated: Club[]; handicap: Club[] }>({
    calibrated: CALIBRATED_DEFAULT_BAG,
    handicap: DEFAULT_BAG,
  })
  const bag = source === "calibrated" ? bags.calibrated : bags.handicap

  // --- positions ---
  const [holeId, setHoleId] = useState<string | null>(null)
  const [ball, setBall] = useState<LatLng | null>(null)
  const [aimManual, setAimManual] = useState<LatLng | null>(null)
  const [pinManual, setPinManual] = useState<LatLng | null>(null)
  const [placing, setPlacing] = useState<Placing>("ball")
  const [clubChoice, setClubChoice] = useState<string>("auto")
  const [zones, setZones] = useState<UserZone[]>([])
  const [noHazard, setNoHazard] = useState<NoHazardMap>({})
  const [localOnlyZones, setLocalOnlyZones] = useState<UserZone[] | null>(null) // marks made before signing in
  const [syncingZones, setSyncingZones] = useState(false)
  const [drawKind, setDrawKind] = useState<Lie | null>(null)
  const [pendingPoints, setPendingPoints] = useState<LatLng[]>([])
  const [showTrouble, setShowTrouble] = useState(false)
  const [showRings, setShowRings] = useState(true)
  const [showCarry, setShowCarry] = useState(false) // dots are where shots stop; this adds where they landed
  // Score against the golfer's handicap (default) or the PGA TOUR -- chosen on You, saved per device.
  const [compareAgainst, setCompareAgainst] = useState<CompareAgainst>("handicap")
  useEffect(() => {
    const sync = () => setCompareAgainst(readCompareAgainst())
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPARE_AGAINST_KEY) sync()
    }
    sync()
    window.addEventListener(COMPARE_AGAINST_EVENT, sync)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(COMPARE_AGAINST_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])
  const [showZones, setShowZones] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false) // the course/hole/golfer sheet behind the title line
  const [showMarks, setShowMarks] = useState(false) // hand-drawn marks list under the map, collapsed by default
  const [showLayersMenu, setShowLayersMenu] = useState(false) // map toggles and "Mark an area", behind one button
  const [sheetOpen, setSheetOpen] = useState(false) // phones: club table bottom sheet, collapsed by default
  const layersMenuRef = useRef<HTMLDivElement>(null)
  // Rendered through a portal (see below), so its position is tracked in viewport
  // coordinates rather than relying on CSS positioning relative to an ancestor.
  const [layersMenuPos, setLayersMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [recent, setRecent] = useState<CourseHit[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [following, setFollowing] = useState(false)
  const [gpsAccuracyYds, setGpsAccuracyYds] = useState<number | null>(null)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const watchId = useRef<number | null>(null)
  const lastFollowAt = useRef(0)
  const supabaseRef = useRef<ReturnType<typeof createClient>>()
  if (!supabaseRef.current) supabaseRef.current = createClient()
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(null)
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
      // A signed-in golfer's setup numbers become this device's settings the
      // first time Play opens here (their home course, their clubs).
      const onboarded = localStorage.getItem(ONBOARDED_KEY)
      if (baseline && onboarded !== "1") applyBaselineToDevice(baseline)
      else if (!baseline && onboarded == null) setShowSetupPrompt(true)
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        const v = JSON.parse(raw)
        if (v.source === "handicap" || (v.source === "calibrated" && calibrated)) setSource(v.source)
        if (typeof v.handicap === "number") setHandicap(Math.min(36, Math.max(0, v.handicap)))
        if (typeof v.driverCarry === "string") setDriverCarry(v.driverCarry.slice(0, 4))
        if (v.carries && typeof v.carries === "object") setExtraCarries(cleanCarries(v.carries))
        if (typeof v.sevenIronCarry === "string") setSevenIronCarry(v.sevenIronCarry.slice(0, 4))
        if (v.tendency && SIDES.includes(v.tendency.side) && STRENGTHS.includes(v.tendency.strength)) setTendency(v.tendency)
        if (v.bags && typeof v.bags === "object") {
          const cal = Array.isArray(v.bags.calibrated) ? normalizeBag(v.bags.calibrated) : []
          const hcp = Array.isArray(v.bags.handicap) ? normalizeBag(v.bags.handicap) : []
          setBags({ calibrated: cal.length ? cal : CALIBRATED_DEFAULT_BAG, handicap: hcp.length ? hcp : DEFAULT_BAG })
        }
      }
      const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
      if (Array.isArray(r)) setRecent(r.filter((c) => c && typeof c.id === "string" && typeof c.name === "string").slice(0, 5))
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
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ source, handicap, driverCarry, sevenIronCarry, carries: extraCarries, tendency, bags })
      )
    } catch {
      /* storage full or blocked: settings just won't be remembered */
    }
  }, [hydrated, source, handicap, driverCarry, sevenIronCarry, extraCarries, tendency, bags])

  // Save hand-marked zones for the loaded course whenever they change (guest/offline
  // fallback -- while signed in, marks are already the source of truth in Supabase,
  // but keeping a local mirror costs nothing and covers a failed write).
  useEffect(() => {
    if (!course) return
    saveZones(course.id, zones)
  }, [course, zones])

  // Track sign-in state so hand-marked areas can be saved per account instead of
  // just to this browser.
  useEffect(() => {
    const supabase = supabaseRef.current!
    supabase.auth.getUser().then(({ data }) => {
      setAuthUser(data.user ? { id: data.user.id, email: data.user.email ?? null } : null)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null)
    })
    return () => subscription.unsubscribe()
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

  // ---------- course search ----------
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setHits([])
      setSearched(false)
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        const data = await res.json()
        setHits(data.courses ?? [])
        setSearched(true)
      } catch {
        /* aborted or offline: leave the previous list */
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [query])

  type AutoHole = { autoHoleId?: string; autoHoleRef?: number; autoFirstHole?: boolean }

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

  /**
   * The actual geometry fetch: this device's cache, then the shared Supabase cache and
   * OpenStreetMap (both behind `/api/courses/geometry`), in that order. Split out from
   * `loadCourse` so "Refresh course data" can re-run just this half -- it should leave
   * the golfer's current ball/aim/pin exactly where they are, not reset the whole page
   * the way picking a *different* course does.
   */
  async function fetchGeometry(c: CourseHit, opts?: { force?: boolean } & AutoHole) {
    const cacheKey = `golfos.course.${c.id}.v${GEOMETRY_VERSION}`
    const apply = (g: CourseGeometry) => {
      setGeometry(g)
      const pts: LatLng[] = g.holes.flatMap((h) => h.line)
      setFit({ bounds: boundsOf(pts.length ? pts : [{ lat: c.lat as number, lng: c.lng as number }]), key: `course-${c.id}` })
      setLoadError("")
      setLoadState("idle")
      // Stand on a hole straight away so a recommendation shows without any taps:
      // the remembered hole, the default one, or hole 1 of a newly picked course.
      // pickHole does its own state resets, fine since nothing golfer-specific was set yet.
      const target = opts?.autoHoleId
        ? g.holes.find((h) => h.id === opts.autoHoleId)
        : opts?.autoHoleRef
          ? g.holes.find((h) => h.ref === opts.autoHoleRef)
          : opts?.autoFirstHole
            ? g.holes[0]
            : undefined
      if (target) pickHole(target)
    }
    // Saved on this device (great for a round with weak signal): use it if it is recent,
    // unless a refresh was explicitly requested.
    let stale: CourseGeometry | null = null
    if (!opts?.force) {
      try {
        const raw = localStorage.getItem(cacheKey)
        if (raw) {
          const saved = JSON.parse(raw)
          if (saved?.geometry?.holes?.length) {
            if (Date.now() - saved.at < COURSE_CACHE_MAX_AGE_MS) {
              apply({ ...saved.geometry, coast: saved.geometry.coast ?? [] })
              return
            }
            stale = { ...saved.geometry, coast: saved.geometry.coast ?? [] }
          }
        }
      } catch {
        /* ignore unreadable saved data */
      }
    }
    setLoadState("loading")
    setLoadError("")
    // The free map-data servers are often busy. The API route keeps whatever
    // it already fetched, so retrying picks up where the last try stopped.
    // force=1 also skips the server's own (Supabase) cache, so a stale entry there gets replaced.
    const url = `/api/courses/geometry?lat=${c.lat}&lng=${c.lng}&name=${encodeURIComponent(c.name)}&id=${encodeURIComponent(c.id)}&v=${GEOMETRY_VERSION}${opts?.force ? "&force=1" : ""}`
    let lastError = "Could not load course map data"
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) setLoadError(`Map data server is busy, retrying (${attempt + 1}/3)…`)
      try {
        const res = await fetch(url)
        const data = await res.json().catch(() => null)
        if (!res.ok || !data) throw new Error(data?.error ?? lastError)
        const g = { ...(data as CourseGeometry), coast: (data as CourseGeometry).coast ?? [] }
        apply(g)
        if (g.scope === "course-area") {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), geometry: g }))
          } catch {
            /* storage full: fine, it just won't be available offline */
          }
        }
        return
      } catch (e) {
        lastError = e instanceof Error ? e.message : lastError
      }
    }
    if (stale) {
      apply(stale)
      setLoadError("Showing the copy saved on this phone (couldn't refresh it).")
      return
    }
    setLoadState("error")
    setLoadError(lastError)
  }

  async function refreshCourseData() {
    if (!course || refreshing) return
    setRefreshing(true)
    try {
      await fetchGeometry(course, { force: true })
    } finally {
      setRefreshing(false)
    }
  }

  // Loads hand-marked zones for a course: from the signed-in user's account if
  // there is one, otherwise from this browser's local storage. If the account
  // has none yet but this browser does (marks made before signing in, or on a
  // guest session), those are offered for one-time upload rather than silently
  // dropped or silently merged.
  async function loadZonesFor(c: CourseHit) {
    const local = loadZones(c.id)
    if (authUser) {
      const { data, error } = await supabaseRef.current!.from("course_zones").select("id, lie, ring").eq("course_id", c.id)
      if (!error && data) {
        const remote = data as { id: string; lie: Lie; ring: LatLng[] }[]
        setZones(remote)
        setLocalOnlyZones(remote.length === 0 && local.length > 0 ? local : null)
        return
      }
      // Read failed (offline, RLS hiccup, ...): fall back to the local copy rather than showing nothing.
    }
    setZones(local)
    setLocalOnlyZones(null)
  }

  async function syncLocalZonesToAccount() {
    if (!authUser || !course || !localOnlyZones || localOnlyZones.length === 0) return
    setSyncingZones(true)
    try {
      const rows = localOnlyZones.map((z) => ({ user_id: authUser.id, course_id: course.id, lie: z.lie, ring: z.ring }))
      const { data, error } = await supabaseRef.current!.from("course_zones").insert(rows).select("id, lie, ring")
      if (!error && data) {
        setZones(data as { id: string; lie: Lie; ring: LatLng[] }[])
        setLocalOnlyZones(null)
        saveZones(course.id, []) // now that the account has them, this browser doesn't need its own copy
      }
    } finally {
      setSyncingZones(false)
    }
  }

  function toggleClub(c: Club) {
    const current = source === "calibrated" ? bags.calibrated : bags.handicap
    const has = current.includes(c)
    if (has && current.length === 1) return // a bag needs at least one club
    const next = normalizeBag(has ? current.filter((x) => x !== c) : [...current, c])
    setBags((prev) => (source === "calibrated" ? { ...prev, calibrated: next } : { ...prev, handicap: next }))
    setClubChoice("auto")
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

  function remember(c: CourseHit) {
    setRecent((prev) => {
      const next = [c, ...prev.filter((x) => x.id !== c.id)].slice(0, 5)
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
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
    if (!hole || !course) return
    setNoHazard((prev) => {
      const next = { ...prev, [hole.id]: { ...prev[hole.id], [hazard]: value } }
      saveNoHazard(course.id, next)
      return next
    })
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

  // ---------- hand-marking trees / water / OB / etc that aren't on the map ----------
  function startDraw(lie: Lie) {
    setDrawKind(lie)
    setPendingPoints([])
  }
  function addDrawPoint(p: LatLng) {
    setPendingPoints((prev) => [...prev, p])
  }
  function undoDrawPoint() {
    setPendingPoints((prev) => prev.slice(0, -1))
  }
  function cancelDraw() {
    setDrawKind(null)
    setPendingPoints([])
  }
  async function finishDraw() {
    if (!drawKind || pendingPoints.length < 3) return
    const lie = drawKind
    const ring = pendingPoints
    setDrawKind(null)
    setPendingPoints([])
    if (authUser && course) {
      const { data, error } = await supabaseRef.current!
        .from("course_zones")
        .insert({ user_id: authUser.id, course_id: course.id, lie, ring })
        .select("id, lie, ring")
        .single()
      if (!error && data) {
        setZones((prev) => [...prev, data as { id: string; lie: Lie; ring: LatLng[] }])
        return
      }
      // Write failed (offline, etc): still keep the mark locally rather than lose it.
    }
    const zone: UserZone = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, lie, ring }
    setZones((prev) => [...prev, zone])
  }
  async function deleteZone(id: string) {
    setZones((prev) => prev.filter((z) => z.id !== id)) // optimistic
    // supabase-js query builders are lazy thenables -- they only actually send the
    // request once awaited/`.then()`-ed, so this must be awaited, not just built.
    if (authUser) await supabaseRef.current!.from("course_zones").delete().eq("id", id)
  }

  // Corrections are global (course_key, hole_id, field_name), not per-user -- any
  // signed-in golfer can submit or overwrite one, so this is a plain upsert, not
  // scoped to the current account's own rows the way zones are.
  async function submitHoleCorrection(input: HoleCorrectionSubmission) {
    if (!authUser || !course || !hole) return
    const rows: { course_key: string; hole_id: string; field_name: string; original_value: string | null; corrected_value: string; reason: string | null; user_id: string; submitted_by: string | null }[] = []
    const add = (field: string, original: string | null, corrected: number | undefined) => {
      if (corrected == null) return
      rows.push({
        course_key: `ogapi:${course.id}`,
        hole_id: hole.id,
        field_name: field,
        original_value: original,
        corrected_value: String(corrected),
        reason: input.reason || null,
        user_id: authUser.id,
        submitted_by: authUser.email,
      })
    }
    add("par", hole.par != null ? String(hole.par) : null, input.par)
    add("tee_lat", String(hole.line[0].lat), input.teeLat)
    add("tee_lng", String(hole.line[0].lng), input.teeLng)
    add("yardage", hole.yardageYds != null ? String(hole.yardageYds) : null, input.yardageYds)
    add("handicap", hole.strokeIndex != null ? String(hole.strokeIndex) : null, input.strokeIndex)
    if (rows.length === 0) {
      setEditingHole(false)
      return
    }
    setCorrectionSubmitting(true)
    try {
      const { error } = await supabaseRef.current!.from("course_corrections").upsert(rows, { onConflict: "course_key,hole_id,field_name" })
      if (!error) {
        setEditingHole(false)
        setCorrectionNote("Correction submitted. This will help other golfers.")
        setTimeout(() => setCorrectionNote(null), 5000)
        await fetchGeometry(course, { force: true }) // see the fix immediately, not after a manual reload
      }
    } finally {
      setCorrectionSubmitting(false)
    }
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

  const pickerSheet =
    pickerOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 md:items-start md:p-4 md:pt-24"
        onClick={() => setPickerOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Course and hole"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85svh] w-full flex-col overflow-hidden rounded-t-2xl border border-fg/[0.08] bg-page pb-[env(safe-area-inset-bottom)] md:max-w-xl md:rounded-2xl md:pb-0"
        >
          <div className="flex items-center gap-2 border-b border-fg/[0.08] p-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a course"
              aria-label="Find a course"
              className="h-11 min-w-0 flex-1 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
            />
            <button
              onClick={() => setPickerOpen(false)}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-fg/[0.06] hover:text-fg"
            >
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto">
            {query.trim().length >= 3 ? (
              <ul className="divide-y divide-fg/[0.06]">
                {searching && hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">Searching…</li>}
                {!searching && searched && hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">No courses found.</li>}
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => chooseCourse(h)}
                      className="flex min-h-[44px] w-full items-baseline gap-2 px-4 py-2.5 text-left hover:bg-fg/[0.04]"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{h.name}</span>
                      <span className="shrink-0 text-xs text-muted">{[h.city, h.state].filter(Boolean).join(", ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {holes.length > 0 && course && (
                  <section className="p-4">
                    <p className="label-xs">{shortCourseName(course.name)}</p>
                    <div className="mt-2 grid grid-cols-6 gap-1.5">
                      {holes.map((h, i) => (
                        <button
                          key={h.id}
                          onClick={() => {
                            pickHole(h)
                            setPickerOpen(false)
                          }}
                          aria-pressed={h.id === holeId}
                          className={`flex h-12 flex-col items-center justify-center rounded-lg tabular-nums transition-colors ${
                            h.id === holeId ? "bg-accent text-on-accent" : "bg-surface text-fg hover:bg-fg/[0.06]"
                          }`}
                        >
                          <span className="text-sm font-semibold leading-tight">{h.ref ?? i + 1}</span>
                          {h.par != null && <span className="text-[10px] leading-tight opacity-70">Par {h.par}</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {recent.filter((r) => r.id !== course?.id).length > 0 && (
                  <section className="border-t border-fg/[0.06] py-2">
                    <p className="label-xs px-4 pt-2">Recent</p>
                    <ul className="mt-1 divide-y divide-fg/[0.06]">
                      {recent
                        .filter((r) => r.id !== course?.id)
                        .map((r) => (
                          <li key={r.id}>
                            <button
                              onClick={() => chooseCourse(r)}
                              className="flex min-h-[44px] w-full items-center px-4 py-2.5 text-left text-sm text-fg hover:bg-fg/[0.04]"
                            >
                              {r.name}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}

                <section className="space-y-3 border-t border-fg/[0.06] p-4">
                  <p className="label-xs">Shots</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted">Whose shots</span>
                      <select
                        value={source}
                        onChange={(e) => {
                          setSource(e.target.value as "calibrated" | "handicap")
                          setClubChoice("auto")
                        }}
                        className="h-11 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg md:h-9"
                      >
                        {calibrated && <option value="calibrated">{calibratedName}</option>}
                        <option value="handicap">Your clubs</option>
                      </select>
                    </label>
                    {source === "handicap" && (
                      <>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-muted">Handicap</span>
                          <input
                            type="number"
                            min={0}
                            max={36}
                            step={1}
                            inputMode="decimal"
                            value={handicap}
                            onChange={(e) => {
                              setHandicap(Math.min(36, Math.max(0, Number(e.target.value) || 0)))
                            }}
                            className="h-11 w-20 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg md:h-9"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-muted">Driver carry</span>
                          <input
                            type="number"
                            placeholder="avg"
                            inputMode="numeric"
                            value={driverCarry}
                            onChange={(e) => {
                              setDriverCarry(e.target.value)
                            }}
                            className="h-11 w-24 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint md:h-9"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-muted">7-iron carry</span>
                          <input
                            type="number"
                            placeholder="avg"
                            inputMode="numeric"
                            value={sevenIronCarry}
                            onChange={(e) => {
                              setSevenIronCarry(e.target.value)
                            }}
                            className="h-11 w-24 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint md:h-9"
                          />
                        </label>
                        <TendencyPicker
                          value={tendency}
                          onChange={(t) => {
                            setTendency(t)
                          }}
                        />
                      </>
                    )}
                  </div>
                  {source === "handicap" && (
                    <p className="text-xs text-muted">
                      {Object.keys(extraCarries).length > 0 &&
                        `Plus ${Object.keys(extraCarries).length} more carr${Object.keys(extraCarries).length === 1 ? "y" : "ies"} from setup. `}
                      <Link href="/welcome" className="font-semibold text-accent hover:underline">
                        Edit setup
                      </Link>
                    </p>
                  )}
                  <div>
                    <p className="text-xs text-muted">
                      Bag · <span className="tabular-nums">{bag.length}</span> clubs
                    </p>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                      {CLUB_CATALOG.map((c) => {
                        const on = bag.includes(c)
                        return (
                          <button
                            key={c}
                            onClick={() => toggleClub(c)}
                            aria-pressed={on}
                            className={`h-11 rounded-lg text-xs font-medium transition-colors md:h-9 ${
                              on ? "bg-accent text-on-accent" : "bg-surface text-fg-3 hover:text-fg"
                            }`}
                          >
                            {c}
                          </button>
                        )
                      })}
                    </div>
                    {Object.keys(estimatedFrom).length > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        No shots on record for{" "}
                        {Object.entries(estimatedFrom)
                          .map(([club, from]) => `${club} (estimated from ${from})`)
                          .join(", ")}
                        .
                      </p>
                    )}
                  </div>
                </section>

                {course && geometry && (
                  <section className="space-y-2 border-t border-fg/[0.06] p-4 text-xs text-fg-3">
                    <p className="label-xs">Course data</p>
                    <p className="tabular-nums">
                      {holes.length} holes · {stats.greens} greens · {stats.fairways} fairways · {stats.bunkers} bunkers ·{" "}
                      {stats.water} water · {stats.trees} tree areas
                    </p>
                    {hasCourseProblems && (
                      <div className="space-y-1">
                        {geometry.scope === "radius" && <p>No course boundary is mapped, so neighbouring courses may appear.</p>}
                        {holes.length === 0 && <p>No hole lines are mapped. Place the ball and pin by hand.</p>}
                        {holes.length > 0 && stats.greens === 0 && (
                          <p>Greens and hazards aren&rsquo;t traced, so the club ranking is only a distance guide.</p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={refreshCourseData}
                      disabled={refreshing}
                      className="flex h-11 items-center gap-1.5 rounded-lg border border-fg/[0.08] px-3 text-fg-2 hover:text-fg disabled:opacity-50 md:h-9"
                    >
                      <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                      {refreshing ? "Refreshing…" : "Refresh course data"}
                    </button>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>,
      document.body
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
      <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 -mx-4 flex w-[calc(100%+2rem)] min-h-[48px] items-center gap-2 border-b border-fg/[0.08] bg-page/95 px-4 py-1 backdrop-blur-md md:static md:mx-0 md:w-full md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-[44px] min-w-0 items-center gap-1.5 text-left"
        >
          <span className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg tabular-nums">
            {chipParts.join(" · ")}
          </span>
          <ChevronDown size={18} className="shrink-0 text-muted" />
        </button>
        {holes.length > 1 && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => stepHole(-1)}
              aria-label={`Previous hole (${holeLabel(-1)})`}
              title={holeLabel(-1)}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-fg/[0.08] text-fg-2 transition-colors hover:border-fg/20 hover:text-fg md:h-9 md:w-9"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => stepHole(1)}
              aria-label={`Next hole (${holeLabel(1)})`}
              title={holeLabel(1)}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-fg/[0.08] text-fg-2 transition-colors hover:border-fg/20 hover:text-fg md:h-9 md:w-9"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

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
        <div className="min-w-0 space-y-2.5">
          <div className="flex items-center gap-2 text-xs">
            <div role="group" aria-label="What a tap on the map moves" className="flex shrink-0 overflow-hidden rounded-lg border border-fg/[0.08]">
              {(["ball", "aim", "pin"] as Placing[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlacing(p)}
                  disabled={!!drawKind}
                  aria-pressed={placing === p}
                  title={`Tap the map to move the ${p}`}
                  className={`h-11 px-4 font-medium capitalize disabled:opacity-30 md:h-9 ${
                    placing === p ? "bg-accent text-on-accent" : "bg-surface text-fg-3 hover:text-fg"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {aimManual && (
                <ToolButton
                  onClick={() => {
                    setAimManual(null)
                  }}
                  icon={RotateCcw}
                  label="Reset aim"
                />
              )}
              <div ref={layersMenuRef}>
                <ToolButton
                  onClick={() => {
                    if (!showLayersMenu && layersMenuRef.current) {
                      const r = layersMenuRef.current.getBoundingClientRect()
                      setLayersMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 224) })
                    }
                    setShowLayersMenu((v) => !v)
                  }}
                  icon={Layers}
                  active={showLayersMenu || showTrouble || following || !!drawKind}
                  label="Layers"
                />
              </div>
            </div>
          </div>
          {layersMenu}
          {gpsError && <p className="text-xs text-danger">{gpsError}</p>}
          {gpsNote && !gpsError && <p className="text-xs text-warn" role="status">{gpsNote}</p>}

          {drawKind && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: lieColor(drawKind, 0.33), backgroundColor: lieColor(drawKind, 0.08) }}
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lieColor(drawKind) }} />
              <span className="text-fg-2">
                Tap the map to outline the <strong>{LIE_LABEL[drawKind].toLowerCase()}</strong> area
                {pendingPoints.length > 0 ? ` · ${pendingPoints.length} point${pendingPoints.length === 1 ? "" : "s"}` : ""}.
                {pendingPoints.length >= 3 && " Tap the first (bigger) point again to close it."}
              </span>
              {/* Duplicated as a floating bar over the map on phones (below), so this row is desktop/tablet only. */}
              <div className="ml-auto hidden shrink-0 items-center gap-1.5 md:flex">
                <button
                  onClick={undoDrawPoint}
                  disabled={pendingPoints.length === 0}
                  className="flex items-center gap-1 rounded-md border border-fg/[0.15] px-2 py-1 font-medium text-fg-2 hover:text-fg disabled:opacity-30"
                >
                  <Undo2 size={12} /> Undo
                </button>
                <button
                  onClick={finishDraw}
                  disabled={pendingPoints.length < 3}
                  className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 font-semibold text-on-accent disabled:opacity-30"
                >
                  <Check size={12} /> Finish
                </button>
                <button onClick={cancelDraw} className="flex items-center gap-1 rounded-md border border-fg/[0.15] px-2 py-1 font-medium text-fg-2 hover:text-fg">
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          )}

          <div
            ref={mapWrapRef}
            className="relative isolate h-[60svh] min-h-[380px] overflow-hidden rounded-2xl border border-fg/[0.07] bg-page md:h-[70vh] md:min-h-[460px]"
          >
            {course?.lat != null && course.lng != null ? (
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
            )}
            {/* Drawing controls, pinned over the map so a thumb never has to leave it to tap Finish. */}
            {drawKind && (
              <div className="absolute bottom-3 left-2 right-2 z-[1100] flex items-center justify-center gap-2 md:hidden">
                <button
                  onClick={undoDrawPoint}
                  disabled={pendingPoints.length === 0}
                  className="flex h-11 items-center gap-1 rounded-full border border-white/25 bg-black/80 px-4 text-xs font-medium text-white backdrop-blur-sm disabled:opacity-30"
                >
                  <Undo2 size={13} /> Undo
                </button>
                <button
                  onClick={finishDraw}
                  disabled={pendingPoints.length < 3}
                  className="flex h-11 items-center gap-1 rounded-full bg-accent px-5 text-xs font-semibold text-on-accent disabled:opacity-30"
                >
                  <Check size={13} /> Finish
                </button>
                <button onClick={cancelDraw} className="flex h-11 items-center gap-1 rounded-full border border-white/25 bg-black/80 px-4 text-xs font-medium text-white backdrop-blur-sm">
                  <X size={13} /> Cancel
                </button>
              </div>
            )}
          </div>

          {planReady && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-fg-3">
              {LIES.map((l) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full border border-black/60" style={{ background: lieColor(l) }} />
                  {LIE_LABEL[l]}
                </span>
              ))}
              {showTrouble && (
                <span className="flex items-center gap-1.5 text-fg-2">
                  <span
                    className="inline-block h-2.5 w-14 rounded-full"
                    style={{ background: `linear-gradient(90deg, ${cssColor("map-better")}, ${cssColor("map-marker", 0.2)}, ${cssColor("map-caution")}, ${cssColor("map-worse")})` }}
                  />
                  better ← vs fairway → worse
                </span>
              )}
            </div>
          )}

          {(zones.length > 0 || (localOnlyZones?.length ?? 0) > 0) && (
            <div className="text-xs">
              <button
                type="button"
                onClick={() => setShowMarks((v) => !v)}
                aria-expanded={showMarks}
                className="flex min-h-[44px] items-center gap-1.5 text-fg-3 hover:text-fg md:min-h-0"
              >
                Your marks · <span className="tabular-nums">{zones.length}</span>
                <ChevronDown size={14} className={`transition-transform ${showMarks ? "rotate-180" : ""}`} />
              </button>
              {showMarks && (
                <div className="mt-1.5 space-y-2">
                  {localOnlyZones && localOnlyZones.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2 text-fg-2">
                      <span>
                        {localOnlyZones.length} mark{localOnlyZones.length === 1 ? "" : "s"} saved on this device only.
                      </span>
                      <button
                        onClick={syncLocalZonesToAccount}
                        disabled={syncingZones}
                        className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-semibold text-on-accent disabled:opacity-50"
                      >
                        {syncingZones ? <Loader2 size={12} className="animate-spin" /> : null}
                        {syncingZones ? "Saving…" : "Save to my account"}
                      </button>
                      <button onClick={() => setLocalOnlyZones(null)} className="shrink-0 text-muted hover:text-fg">
                        Not now
                      </button>
                    </div>
                  )}
                  {zones.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {!authUser && (
                        <span className="text-muted">
                          On this device only.{" "}
                          <Link href="/login" className="text-accent hover:underline">
                            Sign in to sync
                          </Link>
                        </span>
                      )}
                      {zones.map((z) => (
                        <span
                          key={z.id}
                          className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-fg-2"
                          style={{ borderColor: lieColor(z.lie, 0.44) }}
                        >
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: lieColor(z.lie) }} />
                          {LIE_LABEL[z.lie]}
                          <button
                            onClick={() => deleteZone(z.id)}
                            aria-label={`Remove marked ${LIE_LABEL[z.lie]} area`}
                            className="text-muted hover:text-danger"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

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
        <div
          role={sheetOpen ? "dialog" : undefined}
          aria-modal={sheetOpen ? true : undefined}
          aria-label={sheetOpen ? "All clubs" : undefined}
          className={
            sheetOpen
              ? "fixed inset-0 z-[1200] !mt-0 flex flex-col bg-page pt-[env(safe-area-inset-top)] md:hidden"
              : "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[1100] flex h-[3.25rem] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-fg/[0.1] bg-surface md:hidden"
          }
        >
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            className={`flex min-h-[3.25rem] shrink-0 items-center justify-between gap-2 px-4 text-left ${sheetOpen ? "border-b border-fg/[0.08]" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs tabular-nums">
              <span className="font-semibold text-fg">{chosen?.club ?? "–"}</span>
              <span className="text-muted">·</span>
              <span className="text-fg-3">{chosen ? `${chosen.plan.expectedStrokes.toFixed(2)} strokes` : "–"}</span>
              <span className="text-muted">·</span>
              <span className="text-fg-3">All clubs</span>
            </span>
            {sheetOpen ? (
              <X size={18} className="shrink-0 text-fg-3" aria-label="Close" />
            ) : (
              <ChevronDown size={16} className="shrink-0 rotate-180 text-fg-3" />
            )}
          </button>
          {sheetOpen && <div className="flex-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">{clubTable}</div>}
        </div>
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
