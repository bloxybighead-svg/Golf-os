"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Layers, Loader2, RefreshCw, RotateCcw, Undo2, X, type LucideIcon } from "lucide-react"
import dynamic from "next/dynamic"
import {
  bearingDeg,
  distanceYds,
  landingPoint,
  ringCentroid,
  type LatLng,
} from "@/lib/course/geo"
import { defaultTeeAim } from "@/lib/course/aim"
import type { StartLie } from "@/lib/course/cost"
import {
  applyConfirmedAbsent,
  assessHoleDataQuality,
  estimatedFairwayCorridor,
  type ConfirmableHazard,
  type HoleDataQuality,
  type SurfaceStatus,
} from "@/lib/course/dataQuality"
import { buildValueGrid, deltaColor, dispersionRing } from "@/lib/course/heatmap"
import { buildLieMap, type Lie, type LieMap, type UserZone } from "@/lib/course/lies"
import { GEOMETRY_VERSION, type CourseFeature, type CourseGeometry, type CourseHole } from "@/lib/course/overpass"
import { bestAim, rankClubs, simulateLandings, type ClubShots } from "@/lib/course/plan"
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

const CourseMap = dynamic(() => import("./CourseMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-muted">Loading map…</div>,
})

export interface CalibratedClub {
  club: string
  meanCarryYds: number
  shots: { carryYds: number; offlineYds: number }[]
}

interface CourseHit {
  id: string
  name: string
  city: string | null
  state: string | null
  par: number | null
  lat: number | null
  lng: number | null
}

interface Props {
  calibrated: CalibratedClub[] | null
  calibratedName: string
  /** The signed-in golfer's latest tracked handicap, for the tee recommendation. */
  trackedHandicap: number | null
  /** The signed-in golfer's setup numbers, applied the first time Play opens on a device. */
  baseline: Baseline | null
}

type AimNote = { club: string; optimal: true } | { club: string; optimal: false; offsetYds: number; savedStrokes: number }

const DOTS_SHOWN = 400
// Below this many strokes, a "saving" is noise (search-vs-holdout disagreement
// or plain sampling variance), not a real improvement worth moving the aim for.
const MEANINGFUL_SAVING = 0.05
const HANDICAP_SHOTS_PER_CLUB = 1000
const LIES: Lie[] = ["green", "fairway", "rough", "bunker", "water", "trees", "oob"]
const LIE_LABEL: Record<Lie, string> = {
  green: "Green",
  fairway: "Fairway",
  rough: "Rough",
  bunker: "Bunker",
  water: "Water",
  trees: "Trees",
  oob: "Out of bounds",
}
const LIE_SHORT: Record<Lie, string> = { green: "Grn", fairway: "Fwy", rough: "Rgh", bunker: "Bkr", water: "Wtr", trees: "Tre", oob: "OB" }
const STATUS_TITLE: Record<SurfaceStatus, string> = {
  mapped: "Mapped in the course data",
  "hand-drawn": "Hand-drawn by you",
  estimated: "Not mapped, so estimated",
  missing: "Not mapped",
  "confirmed-absent": "You confirmed there's none here. Click to undo.",
}
const ALWAYS_SHOWN: Lie[] = ["green", "fairway", "rough"]
// Options offered by "Mark area" for hand-drawing what the map doesn't show
// (or gets wrong): "fairway"/"rough"/"green" let you mark a SAFE area too,
// e.g. to correct a wrongly-guessed out-of-bounds patch.
const DRAW_KINDS: Lie[] = ["trees", "water", "bunker", "oob", "fairway", "rough", "green"]
// A first visit opens straight onto a real, well-mapped hole with the ball on the
// tee, so the recommendation is the first thing anyone sees -- no instructions.
const DEFAULT_COURSE: CourseHit = {
  id: "40977ee8-33ee-4195-b6a2-99a4ca83c2bc",
  name: "Pebble Beach Golf Links",
  city: "Pebble Beach",
  state: "CA",
  par: 72,
  lat: 36.5685,
  lng: -121.949,
}
const DEFAULT_HOLE_REF = 7
const RECENT_KEY = "golfos.recentCourses.v1"
const COURSE_CACHE_MAX_AGE_MS = 30 * 24 * 3600 * 1000
const YD_PER_M = 1.09361
const SIDES = ["auto", "straight", "left", "right", "both"]
const STRENGTHS = ["slight", "moderate", "strong"]

function zonesKey(courseId: string): string {
  return `golfos.zones.${courseId}.v1`
}

function zoomKey(courseId: string): string {
  return `golfos.zoom.${courseId}.v1`
}

/** Remembered zoom for a course, used only as the INITIAL view when it loads -- picking a
 * hole still fits that hole's own bounds, which is a smarter default than a stale number
 * from a differently-shaped hole. */
function loadZoom(courseId: string): number | undefined {
  try {
    const v = Number(localStorage.getItem(zoomKey(courseId)))
    return Number.isFinite(v) && v >= 10 && v <= 21 ? v : undefined
  } catch {
    return undefined
  }
}

function saveZoom(courseId: string, zoom: number) {
  try {
    localStorage.setItem(zoomKey(courseId), String(zoom))
  } catch {
    /* storage full or blocked: it just won't be remembered next time */
  }
}

type NoHazardMap = Record<string, Partial<Record<ConfirmableHazard, boolean>>> // holeId -> which hazards are confirmed absent

function noHazardKey(courseId: string): string {
  return `golfos.noHazard.${courseId}.v1`
}

/** Which hazards the golfer has confirmed don't exist on which holes, saved on this device. */
function loadNoHazard(courseId: string): NoHazardMap {
  try {
    const raw = localStorage.getItem(noHazardKey(courseId))
    if (!raw) return {}
    const v = JSON.parse(raw)
    return v && typeof v === "object" ? v : {}
  } catch {
    return {}
  }
}

function saveNoHazard(courseId: string, map: NoHazardMap) {
  try {
    localStorage.setItem(noHazardKey(courseId), JSON.stringify(map))
  } catch {
    /* storage full or blocked: the confirmations just won't be remembered */
  }
}

interface LastPosition {
  course: CourseHit
  holeId: string | null
}

/** The last course (and hole, if one was picked) the golfer had open, so reopening the
 * planner can resume there instead of starting from an empty search every time. */
function loadLastPosition(): LastPosition | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_POSITION_KEY) ?? "null")
    return v && v.course && typeof v.course.id === "string" && typeof v.course.name === "string" ? v : null
  } catch {
    return null
  }
}

function saveLastPosition(pos: LastPosition) {
  try {
    localStorage.setItem(LAST_POSITION_KEY, JSON.stringify(pos))
  } catch {
    /* storage full or blocked: it just won't resume next time */
  }
}

// Updates just the remembered hole, keeping whichever course loadCourse already saved --
// reading it back (instead of taking the course as a parameter) sidesteps a stale-closure
// trap: pickHole can run inside the SAME async call that is still in the middle of loading
// a course, before that course's own setCourse state update has actually rendered.
function updateLastPositionHole(holeId: string) {
  try {
    const raw = localStorage.getItem(LAST_POSITION_KEY)
    if (!raw) return
    const v = JSON.parse(raw)
    if (v?.course) localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ course: v.course, holeId }))
  } catch {
    /* ignore */
  }
}

/** Zones a golfer hand-marks for a course (trees, OB, water, ...), saved on this device. */
function loadZones(courseId: string): UserZone[] {
  try {
    const raw = localStorage.getItem(zonesKey(courseId))
    if (!raw) return []
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(
      (z): z is UserZone =>
        !!z && typeof z.id === "string" && (DRAW_KINDS as string[]).includes(z.lie) && Array.isArray(z.ring) && z.ring.length >= 3
    )
  } catch {
    return []
  }
}

function saveZones(courseId: string, zones: UserZone[]) {
  try {
    localStorage.setItem(zonesKey(courseId), JSON.stringify(zones))
  } catch {
    /* storage full or blocked: the marks just won't be remembered */
  }
}

function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
  if (points.length === 0) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  return [[minLat, minLng], [maxLat, maxLng]]
}

const pct = (x: number) => (x < 0.005 ? "–" : `${Math.round(x * 100)}%`)

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
  const [aimNote, setAimNote] = useState<AimNote | null>(null)
  const [gpsError, setGpsError] = useState("")
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
    setAimNote(null)
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
    setAimNote(null)
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
    const end = h.line[h.line.length - 1]
    let best: LatLng | null = null
    let bestD = 60
    for (const f of geometry?.features ?? []) {
      if (f.kind !== "green") continue
      const c = ringCentroid(f.ring)
      const d = distanceYds(c, end)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best ?? end
  }

  function pickHole(h: CourseHole) {
    setHoleId(h.id)
    setBall(h.line[0])
    setAimManual(null)
    setPinManual(null)
    setAimNote(null)
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

  const lies = useMemo(() => {
    if (course?.lat == null || course.lng == null) return null
    // "estimated" only happens when neither OSM nor a hand-drawn zone has a
    // fairway for this hole -- fill in a corridor so club/aim scoring has
    // something to work with instead of treating the whole hole as rough.
    const extraFeatures: CourseFeature[] =
      hole && geometry && holeQuality?.fairway === "estimated" ? [estimatedFairwayCorridor(hole, holePinFor(hole))] : []
    return buildLieMap(
      { lat: course.lat, lng: course.lng },
      [...(geometry?.features ?? []), ...extraFeatures],
      geometry?.coast ?? [],
      zones
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, geometry, zones, hole, holeQuality])

  // Where the ball is lying: the tee uses the tour tee-shot baseline, anything else its mapped lie.
  const startLie: StartLie = useMemo(() => {
    if (!ball) return "fairway"
    if (hole && distanceYds(ball, hole.line[0]) < 15) return "tee"
    return lies ? lies.lieAt(ball) : "fairway"
  }, [ball, hole, lies])

  const ranking = useMemo(() => {
    if (!ball || !aim || !pin || !lies) return []
    return rankClubs(clubShots, { from: ball, aim, pin, lies, startLie })
  }, [ball, aim, pin, lies, clubShots, startLie])

  const shownLies = LIES.filter((l) => ALWAYS_SHOWN.includes(l) || ranking.some((r) => r.lieShare[l] >= 0.005))
  const chosen = ranking.find((r) => r.club === clubChoice) ?? ranking[0] ?? null
  const chosenShots = chosen ? clubShots.find((c) => c.club === chosen.club) : undefined

  // Which club auto-aim should optimize for -- ranked at the HEURISTIC aim,
  // never the live (possibly hand-dragged) one. Using the live "chosen" club
  // here would create a feedback loop: dragging the aim to a deliberately
  // bad spot can make a different club rank best there, which would then
  // retrigger auto-aim (below) and immediately snap the drag back.
  const autoTargetClub = useMemo(() => {
    if (clubChoice !== "auto") return clubChoice
    if (!ball || !defaultAim || !pin || !lies) return null
    return rankClubs(clubShots, { from: ball, aim: defaultAim, pin, lies, startLie })[0]?.club ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubChoice, ball, defaultAim, pin, lies, clubShots, startLie])

  // Auto-aim: the heuristic default (tee -> fairway middle, or the pin) is
  // just a starting guess, not a search result -- left alone, "the" aim shown
  // the instant a hole loads could be beaten by a hand-dragged one, which is
  // backwards for a strokes-gained tool. Whenever the golfer's actual stance
  // (ball, pin, mapped/hand-drawn geometry, or which club is being planned
  // for) genuinely changes, silently re-run the same search "Find best aim"
  // uses and lock in whatever it finds -- so the number on screen is always
  // the best this tool knows how to find, with no click required. A manual
  // aim drag *within* the same stance (nothing above changed) is left alone.
  const autoAimRef = useRef<{ ball: LatLng | null; pin: LatLng | null; lies: LieMap | null; club: string | null }>({
    ball: null,
    pin: null,
    lies: null,
    club: null,
  })
  useEffect(() => {
    if (!ball || !defaultAim || !pin || !lies || !autoTargetClub) return
    const targetShots = clubShots.find((c) => c.club === autoTargetClub)
    if (!targetShots) return
    const last = autoAimRef.current
    if (last.ball === ball && last.pin === pin && last.lies === lies && last.club === autoTargetClub) return
    autoAimRef.current = { ball, pin, lies, club: autoTargetClub }
    const r = bestAim(targetShots, { from: ball, aim: defaultAim, pin, lies, startLie })
    const saved = r.baselineStrokes - r.plan.expectedStrokes
    if (saved >= MEANINGFUL_SAVING) {
      const dist = distanceYds(ball, defaultAim)
      setAimManual(landingPoint(ball, r.bearingDeg, dist, 0))
    } else {
      setAimManual(null) // the heuristic default is already (near enough) optimal
    }
  }, [ball, defaultAim, pin, lies, autoTargetClub, clubShots, startLie])

  const landings = useMemo(() => {
    if (!chosenShots || !ball || !aim || !lies) return []
    return simulateLandings(seededSample(chosenShots.shots, DOTS_SHOWN, 3), ball, bearingDeg(ball, aim), lies)
  }, [chosenShots, ball, aim, lies])

  // Trouble map: what each spot around the hole costs compared with a fairway lie.
  const troubleCells = useMemo(() => {
    if (!showTrouble || !ball || !pin || !lies) return []
    const pts = [ball, aim ?? pin, pin, ...(hole?.line ?? [])]
    return buildValueGrid(pts, pin, ball, startLie, lies).flatMap((c) => {
      const { color, opacity } = deltaColor(c.delta)
      return opacity > 0 ? [{ sw: c.sw, ne: c.ne, color, opacity }] : []
    })
  }, [showTrouble, ball, aim, pin, hole, lies, startLie])

  // 50% and 90% dispersion rings around where the chosen club's shots land.
  const rings = useMemo(() => {
    if (!showRings || landings.length < 5) return []
    const pts = landings.map((l) => l.point)
    return [dispersionRing(pts, 1.177), dispersionRing(pts, 2.146)].filter((r) => r.length > 0)
  }, [showRings, landings])

  function findBestAim() {
    if (!chosenShots || !ball || !aim || !pin || !lies) return
    const r = bestAim(chosenShots, { from: ball, aim, pin, lies, startLie })
    const saved = r.baselineStrokes - r.plan.expectedStrokes
    if (saved < MEANINGFUL_SAVING) {
      setAimNote({ club: chosenShots.club, optimal: true })
      return
    }
    const dist = distanceYds(ball, aim)
    setAimManual(landingPoint(ball, r.bearingDeg, dist, 0))
    setAimNote({ club: chosenShots.club, optimal: false, offsetYds: r.offsetYds, savedStrokes: saved })
  }

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
  }

  // Keeps the ball on your live GPS position (about every 2.5 s) so the yardages update as you walk.
  function toggleFollow() {
    if (following) {
      stopFollowing()
      return
    }
    setGpsError("")
    if (!navigator.geolocation) {
      setGpsError("This browser has no location access.")
      return
    }
    setFollowing(true)
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now()
        if (now - lastFollowAt.current < 2500) return
        lastFollowAt.current = now
        setBall({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGpsAccuracyYds(Math.round(pos.coords.accuracy * YD_PER_M))
        setAimNote(null)
      },
      (err) => {
        setGpsError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.")
        stopFollowing()
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    )
  }

  function useMyLocation() {
    setGpsError("")
    if (!navigator.geolocation) {
      setGpsError("This browser has no location access.")
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setBall(p)
        setAimNote(null)
        setFit({ bounds: boundsOf([p, ...(pin ? [pin] : [])]), key: `gps-${Date.now()}` })
      },
      (err) => setGpsError(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location."),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const stats = useMemo(() => {
    const count = (k: string) => (geometry?.features ?? []).filter((f) => f.kind === k).length
    return { greens: count("green"), fairways: count("fairway"), bunkers: count("bunker"), water: count("water"), trees: count("trees"), range: count("range") }
  }, [geometry])

  const distPin = ball && pin ? distanceYds(ball, pin) : null
  const distAim = ball && aim ? distanceYds(ball, aim) : null
  const aimToPin = aim && pin ? distanceYds(aim, pin) : null
  const aimIsPin = aimToPin != null && aimToPin < 3
  // Where the recommended club's average shot ends up, and what that leaves.
  const avgLeft =
    ball && aim && pin && chosen
      ? distanceYds(landingPoint(ball, bearingDeg(ball, aim), chosen.meanCarryYds, 0), pin)
      : null

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
  const best = ranking[0]
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
    best && chosen ? (
      <div className="rounded-2xl border border-fg/[0.07] bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="label-xs">{clubChoice === "auto" || chosen.club === best.club ? "Best club" : "Your pick"}</p>
          <p className="text-xs text-muted">
            From {fromLabel}
            {hole && !!hole.correctedFields?.length && (
              <span title={`Corrected: ${hole.correctedFields.join(", ")}`}> · corrected</span>
            )}
            {hole && (
              <>
                {" · "}
                <button onClick={() => setEditingHole(true)} className="hover:text-fg hover:underline">
                  Edit hole
                </button>
              </>
            )}
          </p>
        </div>

        <div className="mt-1 flex items-end justify-between gap-4">
          <p className="min-w-0 truncate text-5xl font-semibold leading-none tracking-tight text-fg tabular-nums">{chosen.club}</p>
          <p className="shrink-0 text-right">
            <span className="block text-4xl font-semibold leading-none text-accent tabular-nums">
              {chosen.expectedStrokes.toFixed(2)}
            </span>
            <span className="text-xs text-muted">strokes to hole out</span>
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-3 divide-x divide-fg/[0.08] border-y border-fg/[0.08] py-2 text-center">
          <Stat label="To aim" value={distAim != null ? Math.round(distAim) : null} />
          <Stat label={aimIsPin ? "Aim is pin" : "Left"} value={aimIsPin ? 0 : aimToPin != null ? Math.round(aimToPin) : null} />
          <Stat label="To pin" value={distPin != null ? Math.round(distPin) : null} />
        </dl>

        <p className="mt-2 text-xs text-fg-3">
          Averages <span className="tabular-nums">{Math.round(chosen.meanCarryYds)}</span> yd
          {avgLeft != null && (
            <>
              , leaving <span className="font-semibold text-fg tabular-nums">{Math.round(avgLeft)}</span> yd
            </>
          )}
          .
          {estimatedFrom[chosen.club] && <> Estimated from your {estimatedFrom[chosen.club]}.</>}
          {clubChoice !== "auto" && chosen.club !== best.club && (
            <>
              {" "}
              {best.club} saves{" "}
              <span className="font-semibold text-accent tabular-nums">{(chosen.expectedStrokes - best.expectedStrokes).toFixed(2)}</span>{" "}
              strokes.
            </>
          )}
        </p>

        {holeQuality && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {(
              [
                ["fairway", "Fairway", holeQuality.fairway],
                ["greens", "Greens", holeQuality.greens],
                ["bunkers", "Bunkers", holeQuality.bunkers],
                ["water", "Water", holeQuality.water],
              ] as [keyof HoleDataQuality, string, SurfaceStatus][]
            ).map(([key, label, status]) => {
              const icon =
                status === "mapped" || status === "confirmed-absent" ? (
                  <Check size={12} className="text-accent" />
                ) : status === "missing" ? (
                  <X size={12} className="text-danger" />
                ) : (
                  <AlertTriangle size={12} className="text-warn" />
                )
              return status === "confirmed-absent" ? (
                <button
                  key={key}
                  onClick={() => setHazardConfirmed(key as ConfirmableHazard, false)}
                  className="flex items-center gap-1 hover:opacity-75"
                  title={STATUS_TITLE[status]}
                >
                  {icon}
                  <span className="text-fg-3">{label}</span>
                </button>
              ) : (
                <span key={key} className="flex items-center gap-1" title={STATUS_TITLE[status]}>
                  {icon}
                  <span className="text-fg-3">{label}</span>
                </span>
              )
            })}
          </div>
        )}
        {holeQuality &&
          (holeQuality.fairway === "estimated" ||
            holeQuality.bunkers === "missing" ||
            holeQuality.water === "missing" ||
            holeQuality.greens === "missing") && (
            <div className="mt-1.5 space-y-1 text-[11px] text-fg-3">
              {holeQuality.fairway === "estimated" && (
                <p>
                  Fairway estimated.{" "}
                  <button onClick={() => startDraw("fairway")} className="font-semibold text-accent hover:underline">
                    Mark fairway
                  </button>
                </p>
              )}
              {holeQuality.bunkers === "missing" && (
                <p>
                  Bunkers not mapped.{" "}
                  <button onClick={() => startDraw("bunker")} className="font-semibold text-accent hover:underline">
                    Mark bunkers
                  </button>
                  {" · "}
                  <button onClick={() => setHazardConfirmed("bunkers", true)} className="hover:text-fg hover:underline">
                    None here
                  </button>
                </p>
              )}
              {holeQuality.water === "missing" && (
                <p>
                  Water not mapped.{" "}
                  <button onClick={() => startDraw("water")} className="font-semibold text-accent hover:underline">
                    Mark water
                  </button>
                  {" · "}
                  <button onClick={() => setHazardConfirmed("water", true)} className="hover:text-fg hover:underline">
                    None here
                  </button>
                </p>
              )}
              {holeQuality.greens === "missing" && (
                <p>
                  Green not mapped.{" "}
                  <button onClick={() => startDraw("green")} className="font-semibold text-accent hover:underline">
                    Mark green
                  </button>
                </p>
              )}
            </div>
          )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={findBestAim}
            className="h-11 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent/10 md:h-9"
          >
            Find best aim
          </button>
          {clubChoice !== "auto" && (
            <button
              onClick={() => setClubChoice("auto")}
              className="h-11 rounded-lg border border-fg/[0.08] px-3 text-xs text-fg-3 hover:text-fg md:h-9"
            >
              Back to best club
            </button>
          )}
        </div>
        {/* Reserves the space a result takes so tapping "Find best aim" doesn't shift anything
            below it and cause a mis-tap -- a real problem on a phone. */}
        <div className="mt-2 min-h-[2.75rem] text-xs text-fg-3">
          {aimNote && (
            <p>
              {aimNote.optimal ? (
                <>Already the best aim for the {aimNote.club}.</>
              ) : (
                <>
                  Moved {Math.abs(aimNote.offsetYds)} yd {aimNote.offsetYds < 0 ? "left" : "right"}, saving{" "}
                  <span className="font-semibold text-accent tabular-nums">{aimNote.savedStrokes.toFixed(2)}</span> strokes.
                </>
              )}
            </p>
          )}
        </div>
      </div>
    ) : null

  // No hole lines to stand on: the golfer places the ball and pin by hand.
  const placePrompt =
    course && geometry && !planReady ? (
      <p className="py-2 text-sm text-fg-3">{!ball ? "Tap the map to place the ball." : "Now tap to place the pin."}</p>
    ) : null

  const clubTable = (
    <div className="overflow-x-auto rounded-2xl border border-fg/[0.07] bg-surface">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="border-b border-fg/[0.06] text-left text-muted">
            <th className="px-3 py-2.5 font-medium">Club</th>
            <th className="px-1 py-2.5 text-right font-medium">Carry</th>
            {shownLies.map((l) => (
              <th key={l} className="px-1 py-2.5 text-right font-medium" title={LIE_LABEL[l]}>
                {LIE_SHORT[l]}
              </th>
            ))}
            <th
              className="px-3 py-2.5 text-right font-medium"
              title={`Extra strokes to hole out vs the best club here (${best?.club ?? "—"}), on the same shots`}
            >
              vs {best?.club ?? "best"}
            </th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r) => (
            <tr
              key={r.club}
              onClick={() => setClubChoice(r.club)}
              className={`cursor-pointer border-b border-fg/[0.04] transition-colors last:border-0 hover:bg-fg/[0.04] [&>td]:py-2.5 md:[&>td]:py-1.5 ${
                chosen?.club === r.club ? "bg-accent/10" : ""
              }`}
            >
              <td className="whitespace-nowrap px-3 font-semibold text-fg">
                {r.club}
                {estimatedFrom[r.club] && (
                  <span className="ml-1 text-[10px] font-normal text-muted" title={`No ${r.club} shots on record: estimated from your ${estimatedFrom[r.club]}`}>
                    est.
                  </span>
                )}
              </td>
              <td className="px-1 text-right text-fg-3">{Math.round(r.meanCarryYds)}</td>
              {shownLies.map((l) => (
                <td key={l} className="px-1 text-right text-fg-3">
                  {pct(r.lieShare[l])}
                </td>
              ))}
              <td className="px-3 text-right font-semibold text-fg">+{(r.expectedStrokes - best.expectedStrokes).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const scoringDetails = (
    <details className="rounded-2xl border border-fg/[0.07] bg-surface px-4 py-3 text-xs leading-relaxed text-fg-3">
      <summary className="cursor-pointer select-none font-medium text-fg-2">How this is scored</summary>
      <div className="mt-2 space-y-2">
        <p>
          Every shot is placed on the map and given a lie (green, fairway, rough, bunker, trees, water or out of bounds).
          Its value is the PGA TOUR average number of strokes to hole out from that lie and distance, from Mark Broadie&rsquo;s
          published benchmark (<em>Assessing Golfer Performance on the PGA TOUR</em>, Interfaces 2012, Table 9; putting from{" "}
          <em>Putts Gained</em>, 2011). &ldquo;Strokes to hole out&rdquo; is that value, plus one for the shot itself.
        </p>
        <p>
          The table&rsquo;s last column compares every club against the best one here, not against a tour player: the best
          club is always +0.00 and every other club shows how many extra strokes it&rsquo;s expected to cost.
        </p>
        <p>
          Water costs one penalty stroke plus a drop; out of bounds is stroke and distance; trees use the benchmark&rsquo;s
          &ldquo;recovery&rdquo; column. These rules are my assumptions, since the benchmark doesn&rsquo;t cover them.
        </p>
        <p>
          Shapes come from OpenStreetMap volunteers, so anything untraced counts as rough. The ✓ / ⚠ / ✗ line shows what is
          mapped, estimated or missing for this hole; Layers → Mark an area outlines trees, water, out of bounds, or a safe
          patch the map got wrong. Your marks beat the map, and a missing fairway is estimated as a corridor down the middle
          until you draw the real one. Slope, wind and elevation aren&rsquo;t modelled. &ldquo;Find best aim&rdquo; re-checks
          its suggestion on a held-out half of the shots it didn&rsquo;t use to pick that aim, so the reported saving
          isn&rsquo;t the search grading its own winner.
        </p>
      </div>
    </details>
  )

  const layersMenu =
    showLayersMenu &&
    layersMenuPos &&
    createPortal(
      // Rendered through a portal to document.body, not inline: the map sits in its own
      // stacking context (Leaflet's CSS), which made a same-tree dropdown paint underneath it.
      <div
        style={{ top: layersMenuPos.top, left: layersMenuPos.left }}
        className="fixed z-[1300] max-h-[70svh] w-56 space-y-0.5 overflow-y-auto rounded-lg border border-fg/[0.1] bg-page p-1.5 shadow-2xl"
      >
        <LayerMenuItem
          onClick={() => {
            useMyLocation()
            setShowLayersMenu(false)
          }}
          label="My location"
        />
        <LayerMenuItem
          onClick={() => {
            toggleFollow()
            setShowLayersMenu(false)
          }}
          active={following}
          label={following ? `Following${gpsAccuracyYds != null ? ` ±${gpsAccuracyYds} yd` : "…"}` : "Follow GPS"}
        />
        <LayerMenuItem
          onClick={() => {
            setShowTrouble((v) => !v)
            setShowLayersMenu(false)
          }}
          active={showTrouble}
          label="Trouble map"
        />
        <LayerMenuItem
          onClick={() => {
            setShowRings((v) => !v)
            setShowLayersMenu(false)
          }}
          active={showRings}
          label="Shot rings"
        />
        {zones.length > 0 && (
          <LayerMenuItem
            onClick={() => {
              setShowZones((v) => !v)
              setShowLayersMenu(false)
            }}
            active={showZones}
            label="My marks"
          />
        )}
        <p className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-muted">Mark an area</p>
        {DRAW_KINDS.map((k) => (
          <LayerMenuItem
            key={k}
            onClick={() => {
              startDraw(k)
              setShowLayersMenu(false)
            }}
            active={drawKind === k}
            label={LIE_LABEL[k]}
          />
        ))}
      </div>,
      document.body
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
                          setAimNote(null)
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
                              setAimNote(null)
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
                              setAimNote(null)
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
                              setAimNote(null)
                            }}
                            className="h-11 w-24 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint md:h-9"
                          />
                        </label>
                        <TendencyPicker
                          value={tendency}
                          onChange={(t) => {
                            setTendency(t)
                            setAimNote(null)
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
                    setAimNote(null)
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
            className="relative h-[60svh] min-h-[380px] overflow-hidden rounded-2xl border border-fg/[0.07] bg-page md:h-[70vh] md:min-h-[460px]"
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
                  setBall(p)
                  setAimNote(null)
                  if (!pin) setPlacing("pin") // no hole to take a pin from: the next tap places it
                }}
                onAim={(p) => {
                  setAimManual(p)
                  setAimNote(null)
                }}
                onPin={(p) => {
                  setPinManual(p)
                  setAimNote(null)
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
            {/* Phone HUD: the numbers you need mid-round, on the map itself (hidden while drawing, replaced by the controls below) */}
            {ball && pin && distPin != null && !drawKind && (
              <div className="pointer-events-none absolute bottom-7 left-2 right-2 z-[1100] grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-white/20 bg-white/10 text-center backdrop-blur-sm md:hidden">
                {[
                  { k: "Club", v: chosen?.club ?? "–", small: true },
                  { k: "To aim", v: distAim != null ? `${Math.round(distAim)}` : "–" },
                  { k: aimIsPin ? "Pin" : "Left", v: aimIsPin ? "0" : aimToPin != null ? `${Math.round(aimToPin)}` : "–" },
                  { k: "To pin", v: `${Math.round(distPin)}` },
                ].map((cell) => (
                  <div key={cell.k} className="bg-black/75 px-1 py-1.5">
                    <p className="text-[9px] uppercase tracking-wide text-gray-400">{cell.k}</p>
                    <p className={`font-semibold text-white tabular-nums ${cell.small ? "truncate text-sm" : "text-lg leading-tight"}`}>{cell.v}</p>
                  </div>
                ))}
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

      {planReady && ranking.length > 0 && !scoring && (
        <div
          className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col overflow-hidden rounded-t-2xl border border-b-0 border-fg/[0.1] bg-surface transition-[max-height] duration-200 md:hidden"
          style={{ maxHeight: sheetOpen ? "min(65vh, 26rem)" : "3.25rem" }}
        >
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            className="flex min-h-[3.25rem] shrink-0 items-center justify-between gap-2 px-4 text-left"
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs tabular-nums">
              <span className="font-semibold text-fg">{chosen?.club ?? "–"}</span>
              <span className="text-muted">·</span>
              <span className="text-fg-3">{chosen ? `${chosen.expectedStrokes.toFixed(2)} strokes` : "–"}</span>
              <span className="text-muted">·</span>
              <span className="text-fg-3">All clubs</span>
            </span>
            <ChevronDown size={16} className={`shrink-0 text-fg-3 transition-transform ${sheetOpen ? "" : "rotate-180"}`} />
          </button>
          <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">{clubTable}</div>
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

// ---------- small presentational helpers ----------

/** "Pebble Beach Golf Links" -> "Pebble Beach": the title line has room for one short name. */
function shortCourseName(name: string): string {
  const short = name.replace(/\s+(golf\s+(club|links|course|resort)|country\s+club|g\.?c\.?|c\.?c\.?)$/i, "").trim()
  return short || name
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="px-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-2xl font-semibold leading-tight text-fg tabular-nums">
        {value ?? "–"}
        <span className="ml-0.5 text-xs font-normal text-muted">yd</span>
      </dd>
    </div>
  )
}

// Icon-only (44px) on phones, icon + label from tablet up.
function ToolButton({
  onClick,
  icon: Icon,
  label,
  active,
}: {
  onClick: () => void
  icon: LucideIcon
  label: string
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors md:h-9 md:w-auto md:px-3 ${
        active ? "border-accent text-accent" : "border-fg/[0.08] text-fg-3 hover:border-fg/20 hover:text-fg"
      }`}
    >
      <Icon size={15} />
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}

// A full-width row inside the Layers menu.
function LayerMenuItem({ onClick, label, active }: { onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm ${
        active ? "text-accent" : "text-fg-2 hover:bg-fg/[0.06] hover:text-fg"
      }`}
    >
      {label}
      {active && <Check size={14} />}
    </button>
  )
}
