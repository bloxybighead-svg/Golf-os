"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Circle,
  Crosshair,
  Eye,
  Flag,
  History,
  Info,
  Layers,
  Loader2,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Navigation,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  SquarePen,
  Target,
  Undo2,
  User,
  X,
  type LucideIcon,
} from "lucide-react"
import PageHeader from "@/components/PageHeader"
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
import { createClient } from "@/lib/supabase/client"
import { TendencyPicker } from "./TendencyPicker"
import { EditHoleModal, type HoleCorrectionSubmission } from "./EditHoleModal"
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
  estimated: "Not mapped — using an estimated fallback",
  missing: "Not mapped",
  "confirmed-absent": "You confirmed there's none here — click to undo",
}
const ALWAYS_SHOWN: Lie[] = ["green", "fairway", "rough"]
// Options offered by "Mark area" for hand-drawing what the map doesn't show
// (or gets wrong): "fairway"/"rough"/"green" let you mark a SAFE area too,
// e.g. to correct a wrongly-guessed out-of-bounds patch.
const DRAW_KINDS: Lie[] = ["trees", "water", "bunker", "oob", "fairway", "rough", "green"]
const SETTINGS_KEY = "golfos.planner.v1"
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

const LAST_POSITION_KEY = "golfos.lastPosition.v1"
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

export function CourseMapClient({ calibrated, calibratedName }: Props) {
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
  const [showSettings, setShowSettings] = useState(false) // phones: golfer settings are collapsed by default
  const [setupOpen, setSetupOpen] = useState(true) // phones: course search + golfer settings collapse once a hole is picked
  const [showGeomInfo, setShowGeomInfo] = useState(false) // phones: tap-to-reveal for the course-wide mapped-feature counts
  const [showLayersMenu, setShowLayersMenu] = useState(false) // phones: overflow menu for the less-used map toggles
  const [sheetOpen, setSheetOpen] = useState(false) // phones: club table bottom sheet, collapsed by default
  const layersMenuRef = useRef<HTMLDivElement>(null)
  const layersBtnRef = useRef<HTMLButtonElement>(null)
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
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        const v = JSON.parse(raw)
        if (v.source === "handicap" || (v.source === "calibrated" && calibrated)) setSource(v.source)
        if (typeof v.handicap === "number") setHandicap(Math.min(36, Math.max(0, v.handicap)))
        if (typeof v.driverCarry === "string") setDriverCarry(v.driverCarry.slice(0, 4))
        if (typeof v.sevenIronCarry === "string") setSevenIronCarry(v.sevenIronCarry.slice(0, 4))
        if (v.tendency && SIDES.includes(v.tendency.side) && STRENGTHS.includes(v.tendency.strength)) setTendency(v.tendency)
      }
      const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
      if (Array.isArray(r)) setRecent(r.filter((c) => c && typeof c.id === "string" && typeof c.name === "string").slice(0, 5))
      // Resume where the golfer left off instead of opening to an empty search every time.
      const last = loadLastPosition()
      if (last) void loadCourse(last.course, { autoHoleId: last.holeId ?? undefined })
    } catch {
      /* private mode or corrupt data: start from defaults */
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ source, handicap, driverCarry, sevenIronCarry, tendency }))
    } catch {
      /* storage full or blocked: settings just won't be remembered */
    }
  }, [hydrated, source, handicap, driverCarry, sevenIronCarry, tendency])

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

  // Keep the selected hole's button visible in the scrolling strip.
  useEffect(() => {
    if (!holeId) return
    document.getElementById(`hole-btn-${holeId}`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
  }, [holeId])

  // Stop GPS following when leaving the page.
  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  // Close the phone "Layers" menu on an outside tap. A visual backdrop element would need its
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

  async function loadCourse(c: CourseHit, opts?: { autoHoleId?: string }) {
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
  async function fetchGeometry(c: CourseHit, opts?: { force?: boolean; autoHoleId?: string }) {
    const cacheKey = `golfos.course.${c.id}.v${GEOMETRY_VERSION}`
    const apply = (g: CourseGeometry) => {
      setGeometry(g)
      const pts: LatLng[] = g.holes.flatMap((h) => h.line)
      setFit({ bounds: boundsOf(pts.length ? pts : [{ lat: c.lat as number, lng: c.lng as number }]), key: `course-${c.id}` })
      setLoadError("")
      setLoadState("idle")
      // Resuming a remembered position (mount-time auto-load only): pickHole does its
      // own state resets, which is fine here since nothing golfer-specific was set yet.
      const target = opts?.autoHoleId ? g.holes.find((h) => h.id === opts.autoHoleId) : null
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
  const clubShots: ClubShots[] = useMemo(() => {
    if (source === "calibrated" && calibrated) {
      return calibrated.map((c) => ({ club: c.club, shots: c.shots }))
    }
    // Blank or out-of-range carries are ignored, so a half-typed number doesn't warp the bag.
    const known: Partial<Record<Club, number>> = {}
    const d = Number(driverCarry)
    const i7 = Number(sevenIronCarry)
    if (d >= 120 && d <= 380) known.Driver = d
    if (i7 >= 60 && i7 <= 240) known["7-Iron"] = i7
    const all = generateCustomGolferShots(
      { handicapIndex: handicap, knownCarries: known, tendency },
      HANDICAP_SHOTS_PER_CLUB * 12,
      42
    )
    const by = new Map<string, { carryYds: number; offlineYds: number }[]>()
    for (const s of all) {
      const list = by.get(s.club) ?? []
      list.push({ carryYds: s.carryYds, offlineYds: s.offlineYds })
      by.set(s.club, list)
    }
    return Array.from(by, ([club, shots]) => ({ club, shots }))
  }, [source, calibrated, handicap, driverCarry, sevenIronCarry, tendency])

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
    // On a phone, collapse the search/settings panel into the sticky header and
    // bring the map into view -- otherwise picking a hole doesn't feel like it did anything.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setSetupOpen(false)
      setTimeout(() => mapWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60)
    }
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

  // Shared between the desktop sidebar and the phone layout below it (phones move
  // the table itself into a bottom sheet, but everything else renders the same way).
  const howItWorksCard = (
    <div className="rounded-2xl border border-fg/[0.07] bg-surface p-5 text-sm text-fg-3">
      <p className="mb-1 flex items-center gap-2 font-semibold text-fg">
        <Info size={15} className="text-accent" /> How it works
      </p>
      {holes.length > 0
        ? "Pick a hole number (or click a hole line on the map) to stand on its tee, then drag the ball anywhere."
        : course
          ? "Set the ball, then the pin, using the buttons above the map."
          : "Search for a course, choose a hole, and the planner ranks every club by strokes gained."}
    </div>
  )

  const planCard = (
    <div className="rounded-2xl border border-fg/[0.07] bg-surface p-4 shadow-lg shadow-black/20">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm font-semibold text-fg">
          {hole
            ? `Hole ${hole.ref ?? "?"}${hole.par ? ` · Par ${hole.par}` : ""}${hole.yardageYds ? ` · ${hole.yardageYds} yd` : ""}`
            : "Free placement"}
          {hole && !!hole.correctedFields?.length && (
            <span
              className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
              title={`Corrected: ${hole.correctedFields.join(", ")}`}
            >
              corrected
            </span>
          )}
          {hole && (
            <button
              onClick={() => setEditingHole(true)}
              title="Edit hole data"
              className="flex items-center gap-1 text-[10px] font-medium text-muted hover:text-fg"
            >
              <SquarePen size={11} /> Edit
            </button>
          )}
        </p>
        <p className="text-[11px] text-muted">from {fromLabel}</p>
      </div>

      {holeQuality && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
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
          {geometry && (
            // Phones don't show the course-wide counts row above the map (it's hidden
            // there to save space) -- this info icon is where that count moved to.
            <button
              type="button"
              onClick={() => setShowGeomInfo((v) => !v)}
              aria-label="Course geometry counts"
              className="flex items-center gap-1 text-muted hover:text-fg md:hidden"
            >
              <Info size={12} />
            </button>
          )}
        </div>
      )}
      {showGeomInfo && geometry && (
        <p className="mt-1 text-[11px] text-muted md:hidden">
          {holes.length} holes · {stats.greens} greens · {stats.fairways} fairways · {stats.bunkers} bunkers ·{" "}
          {stats.water} water · {stats.trees} tree areas
        </p>
      )}
      {holeQuality &&
        (holeQuality.fairway === "estimated" ||
          holeQuality.bunkers === "missing" ||
          holeQuality.water === "missing" ||
          holeQuality.greens === "missing") && (
          <div className="mt-1.5 space-y-1 text-[11px] text-warn/90">
            {holeQuality.fairway === "estimated" && (
              <p>
                Fairway isn&rsquo;t mapped here — using an estimated corridor.{" "}
                <button onClick={() => startDraw("fairway")} className="font-semibold text-accent hover:underline">
                  Mark fairway
                </button>
              </p>
            )}
            {holeQuality.bunkers === "missing" && (
              <p>
                Bunkers not mapped — actual SG may vary.{" "}
                <button onClick={() => startDraw("bunker")} className="font-semibold text-accent hover:underline">
                  Mark bunkers
                </button>{" "}
                ·{" "}
                <button
                  onClick={() => setHazardConfirmed("bunkers", true)}
                  className="text-fg-3 hover:text-fg hover:underline"
                >
                  No bunkers here
                </button>
              </p>
            )}
            {holeQuality.water === "missing" && (
              <p>
                Water not mapped — actual SG may vary.{" "}
                <button onClick={() => startDraw("water")} className="font-semibold text-accent hover:underline">
                  Mark water
                </button>{" "}
                ·{" "}
                <button
                  onClick={() => setHazardConfirmed("water", true)}
                  className="text-fg-3 hover:text-fg hover:underline"
                >
                  No water here
                </button>
              </p>
            )}
            {holeQuality.greens === "missing" && (
              <p>
                Green not mapped — actual SG may vary.{" "}
                <button onClick={() => startDraw("green")} className="font-semibold text-accent hover:underline">
                  Mark green
                </button>
              </p>
            )}
          </div>
        )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <StatTile label="Ball to aim" value={distAim != null ? Math.round(distAim) : null} />
        <StatTile label={aimIsPin ? "Aim is pin" : "Left after aim"} value={aimIsPin ? 0 : aimToPin != null ? Math.round(aimToPin) : null} />
        <StatTile label="Ball to pin" value={distPin != null ? Math.round(distPin) : null} />
      </div>

      {best && chosen && (
        <div className="mt-4 rounded-xl border border-accent/25 bg-accent/[0.07] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            {clubChoice === "auto" || chosen.club === best.club ? "Best club" : "Selected club"}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-fg">{chosen.club}</p>
          <p className="mt-1 text-sm font-semibold text-fg">
            Expected {chosen.expectedStrokes.toFixed(2)} strokes to hole out
          </p>
          <p className="mt-1 text-xs text-fg-3">
            Averages {Math.round(chosen.meanCarryYds)} yd
            {avgLeft != null && (
              <>
                , leaving about <span className="font-semibold text-fg">{Math.round(avgLeft)} yd</span>
              </>
            )}
            .
          </p>
          {clubChoice !== "auto" && chosen.club !== best.club && (
            <p className="mt-1 text-xs text-fg-3">
              The planner prefers <span className="font-semibold text-fg">{best.club}</span>, saving{" "}
              <span className="font-semibold text-accent">{(chosen.expectedStrokes - best.expectedStrokes).toFixed(2)}</span>{" "}
              strokes.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={findBestAim}
          disabled={!chosen}
          className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
        >
          <Crosshair size={13} /> Find best aim for {chosen?.club ?? "club"}
        </button>
        {clubChoice !== "auto" && (
          <button
            onClick={() => setClubChoice("auto")}
            className="rounded-lg border border-fg/[0.08] px-3 py-1.5 text-xs text-fg-3 hover:text-fg"
          >
            Back to recommended
          </button>
        )}
      </div>
      {/* Reserves the space a result takes so tapping "Find best aim" doesn't shift anything
          below it and cause a mis-tap -- a real problem on a phone. */}
      <div className="mt-2 min-h-[2.75rem] text-xs text-fg-3">
        {aimNote && (
          <p>
            {aimNote.optimal ? (
              <>Current aim is already optimal for the {aimNote.club}.</>
            ) : (
              <>
                Best aim for the {aimNote.club}: {Math.abs(aimNote.offsetYds)} yd {aimNote.offsetYds < 0 ? "left" : "right"} of
                the old aim, saving about{" "}
                <span className="font-semibold text-accent">+{aimNote.savedStrokes.toFixed(2)} strokes per shot</span>.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )

  const clubTable = (
    <div className="overflow-x-auto rounded-2xl border border-fg/[0.07] bg-surface shadow-lg shadow-black/20">
      <table className="w-full text-xs">
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
              SG (vs {best?.club ?? "best"})
            </th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r, i) => (
            <tr
              key={r.club}
              onClick={() => setClubChoice(r.club)}
              className={`cursor-pointer border-b border-fg/[0.04] transition-colors last:border-0 hover:bg-fg/[0.04] [&>td]:py-2.5 md:[&>td]:py-1.5 ${
                chosen?.club === r.club ? "bg-accent/10" : ""
              }`}
            >
              <td className="whitespace-nowrap px-3 text-fg">
                {r.club}
                {i === 0 && <span className="ml-1 text-[10px] text-accent">★</span>}
              </td>
              <td className="px-1 text-right text-fg-3">{Math.round(r.meanCarryYds)}</td>
              {shownLies.map((l) => (
                <td key={l} className="px-1 text-right text-fg-3">
                  {pct(r.lieShare[l])}
                </td>
              ))}
              <td className="px-3 text-right font-semibold text-accent">
                +{(r.expectedStrokes - best.expectedStrokes).toFixed(2)}
              </td>
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
          Every simulated shot is placed on the map and given a lie (green, fairway, rough, bunker, trees, water or out of bounds).
          Its value is the PGA TOUR average number of strokes to hole out from that lie and distance, from Mark Broadie&rsquo;s
          published benchmark (<em>Assessing Golfer Performance on the PGA TOUR</em>, Interfaces 2012, Table 9; putting from{" "}
          <em>Putts Gained</em>, 2011). &ldquo;Expected strokes to hole out&rdquo; is that value, plus one for the shot itself.
        </p>
        <p>
          The table&rsquo;s &ldquo;SG&rdquo; column compares every club against the best one HERE, not against a tour player —
          the best club is always +0.00 and every other club shows how many extra strokes it&rsquo;s expected to cost, so the
          numbers are always positive and about the choice in front of you, not a tour-average comparison that&rsquo;s usually
          negative for a handicap golfer.
        </p>
        <p>
          Water costs one penalty stroke plus a drop; out of bounds is stroke and distance; trees use the benchmark&rsquo;s
          &ldquo;recovery&rdquo; column. These rules are my assumptions, since the benchmark doesn&rsquo;t cover them.
        </p>
        <p>
          Shapes come from OpenStreetMap volunteers, so anything untraced counts as rough — the badge above the stats shows what
          is (✓), isn&rsquo;t (✗), or is only estimated (⚠) for this hole; use &ldquo;Mark area&rdquo; (or the badge&rsquo;s own
          links) to outline trees, water, out of bounds, or a safe patch the map got wrong. Your marks beat the map, and a missing
          fairway is estimated as a corridor down the middle until you draw the real one. Slope, wind and elevation still
          aren&rsquo;t modelled. &ldquo;Find best aim&rdquo; re-checks its own suggestion on a held-out half of the shots it didn&rsquo;t
          use to pick that aim, so the reported saving isn&rsquo;t just the search grading its own winner.
        </p>
      </div>
    </details>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        icon={MapIcon}
        title="Course Planner"
        subtitle={
          // Explanatory copy is fine to lose on a phone -- it's fluff once you already know the app,
          // and the map should win the space instead.
          <span className="hidden md:inline">
            Pick any course, stand anywhere, and see where each club's simulated shots land — scored in strokes
            gained.
          </span>
        }
      />

      {/* ---- setup ---- */}
      {course && (
        <button
          type="button"
          onClick={() => setSetupOpen((v) => !v)}
          aria-expanded={setupOpen}
          className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 flex w-[calc(100%+2rem)] items-center justify-between gap-2 border-b border-fg/[0.08] bg-page/95 px-4 py-2.5 text-left backdrop-blur-md md:hidden"
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate text-sm">
            <Flag size={13} className="shrink-0 text-accent" />
            <span className="truncate font-semibold text-fg">{course.name}</span>
            {hole && <span className="shrink-0 text-fg-3">· Hole {hole.ref ?? "?"}</span>}
          </span>
          <ChevronDown size={16} className={`shrink-0 text-fg-3 transition-transform ${setupOpen ? "rotate-180" : ""}`} />
        </button>
      )}
      <div
        className={`${setupOpen ? "grid" : "hidden"} gap-4 rounded-2xl border border-fg/[0.07] bg-surface p-4 shadow-lg shadow-black/20 md:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:p-5`}
      >
        <div className="min-w-0 space-y-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Search size={13} /> Course
          </p>
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={course ? `${course.name} — search another…` : "Search a course, e.g. Pebble Beach"}
              aria-label="Search for a golf course"
              className="w-full rounded-xl border border-fg/[0.08] bg-page px-3.5 py-2.5 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            {(hits.length > 0 || searching || (searched && query.trim().length >= 3)) && (
              <div className="absolute z-[1200] mt-1 max-h-72 w-full overflow-auto rounded-xl border border-fg/[0.1] bg-page shadow-2xl">
                {searching && hits.length === 0 && <p className="px-3 py-2.5 text-xs text-muted">Searching…</p>}
                {!searching && hits.length === 0 && <p className="px-3 py-2.5 text-xs text-muted">No courses found. Try fewer words.</p>}
                {hits.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => {
                      setQuery("")
                      loadCourse(h)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-fg hover:bg-fg/[0.06]"
                  >
                    <MapPin size={14} className="shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate">{h.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {[h.city, h.state].filter(Boolean).join(", ")}
                      {h.par ? ` · par ${h.par}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {recent.length > 0 && (
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
              <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
                <History size={12} /> Recent
              </span>
              {recent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => loadCourse(r)}
                  className="shrink-0 rounded-full border border-fg/[0.08] px-3 py-1.5 text-xs text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3 lg:border-l lg:border-fg/[0.06] lg:pl-5">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className="flex w-full items-center justify-between gap-2 text-left lg:pointer-events-none"
          >
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <User size={13} /> Golfer
              <span className="rounded-full bg-fg/[0.06] px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-fg-2">
                {source === "calibrated" ? calibratedName : `Handicap ${handicap}`}
              </span>
            </span>
            <span className="flex items-center gap-1 text-xs text-accent lg:hidden">
              {showSettings ? "Hide" : "Change"}
              <ChevronDown size={14} className={showSettings ? "rotate-180" : ""} />
            </span>
          </button>
          <div className={`${showSettings ? "flex" : "hidden"} flex-wrap items-end gap-3 lg:flex`}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Whose shots</span>
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as "calibrated" | "handicap")
                  setClubChoice("auto")
                  setAimNote(null)
                }}
                className="rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
              >
                {calibrated && <option value="calibrated">{calibratedName} (calibrated)</option>}
                <option value="handicap">Handicap-based golfer</option>
              </select>
            </label>
            {source === "handicap" && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">Handicap</span>
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
                    className="w-20 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">Driver carry (yd)</span>
                  <input
                    type="number"
                    placeholder="avg"
                    inputMode="numeric"
                    value={driverCarry}
                    onChange={(e) => {
                      setDriverCarry(e.target.value)
                      setAimNote(null)
                    }}
                    className="w-24 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg placeholder:text-faint"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted">7-iron carry (yd)</span>
                  <input
                    type="number"
                    placeholder="avg"
                    inputMode="numeric"
                    value={sevenIronCarry}
                    onChange={(e) => {
                      setSevenIronCarry(e.target.value)
                      setAimNote(null)
                    }}
                    className="w-24 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg placeholder:text-faint"
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
        </div>
      </div>

      {/* ---- course status ---- */}
      {course && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-fg-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Flag size={14} className="text-accent" />
            {course.name}
          </span>
          {geometry && loadState !== "loading" && (
            <button
              onClick={refreshCourseData}
              disabled={refreshing}
              title="Re-fetch this course's map data instead of using the cached copy"
              className="flex items-center gap-1 rounded-md border border-fg/[0.08] px-2 py-0.5 text-fg-3 hover:text-fg disabled:opacity-50"
            >
              <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh course data"}
            </button>
          )}
          {loadState === "loading" && (
            <span className="flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" /> {loadError || "Loading map data…"}
            </span>
          )}
          {loadState === "error" && (
            <>
              <span className="text-danger">{loadError}</span>
              <button onClick={() => loadCourse(course)} className="rounded-md border border-fg/[0.08] px-2 py-0.5 text-fg-3 hover:text-fg">
                Retry
              </button>
            </>
          )}
          {geometry && (
            // Hidden on phones -- this is the same count shown compactly via the info icon
            // next to the per-hole data-quality badge below.
            <span className="hidden flex-wrap gap-1.5 md:flex">
              {[
                [holes.length, "holes"],
                [stats.greens, "greens"],
                [stats.fairways, "fairways"],
                [stats.bunkers, "bunkers"],
                [stats.water, "water"],
                [stats.trees, "tree areas"],
                ...(stats.range > 0 ? [[stats.range, "range"]] : []),
              ].map(([n, label]) => (
                <span key={String(label)} className="rounded-full bg-fg/[0.05] px-2 py-0.5">
                  <span className="font-semibold text-fg-2">{n}</span> {label}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      {geometry && geometry.scope === "radius" && (
        <Notice>
          No course boundary is mapped for this course, so this shows everything within about a mile. Neighbouring
          courses may appear.
        </Notice>
      )}
      {geometry && holes.length === 0 && (
        <Notice>No hole lines are mapped for this course in OpenStreetMap. You can still place the ball and the pin by hand.</Notice>
      )}
      {geometry && holes.length > 0 && stats.greens === 0 && (
        <Notice>
          Greens, fairways and hazards aren&rsquo;t traced for this course, so almost everything will count as rough and
          the club ranking is only a distance guide.
        </Notice>
      )}

      {holes.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {holes.map((h, i) => (
            <button
              key={h.id}
              id={`hole-btn-${h.id}`}
              onClick={() => pickHole(h)}
              title={h.par ? `Hole ${h.ref ?? i + 1} · par ${h.par}` : undefined}
              className={`flex min-w-[2.9rem] shrink-0 flex-col items-center rounded-lg border px-2 py-1.5 transition-colors ${
                h.id === holeId
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-fg/[0.08] text-fg-3 hover:border-fg/20 hover:text-fg"
              }`}
            >
              <span className="text-sm font-semibold leading-tight">{h.ref ?? i + 1}</span>
              <span className="text-[10px] leading-tight opacity-70">{h.par ? `P${h.par}` : "–"}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]">
        {/* ---- map ---- (min-w-0 stops the scrolling toolbar from stretching the page on phones) */}
        <div className="min-w-0 space-y-2.5">
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs md:flex-wrap md:overflow-visible">
            <div role="group" aria-label="What a tap on the map moves" className="flex shrink-0 overflow-hidden rounded-lg border border-fg/[0.08]">
              {(["ball", "aim", "pin"] as Placing[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlacing(p)}
                  disabled={!!drawKind}
                  aria-pressed={placing === p}
                  title={`Tap the map to move the ${p}`}
                  className={`flex items-center gap-1.5 px-3 py-2 font-medium capitalize disabled:opacity-30 md:py-1.5 ${
                    placing === p ? "bg-accent text-on-accent" : "bg-surface-2 text-fg-3 hover:text-fg"
                  }`}
                >
                  {p === "ball" ? <Circle size={12} /> : p === "aim" ? <Crosshair size={12} /> : <Flag size={12} />}
                  {p}
                </button>
              ))}
            </div>
            {/* Phones: the less-used toggles live behind this menu so Ball/Aim/Pin never scroll off.
                Rendered through a portal to document.body (below), not positioned inline here --
                the map right below sits in its own stacking context (Leaflet's own CSS), which
                made a same-tree dropdown paint underneath it regardless of z-index. */}
            <div ref={layersMenuRef} className="shrink-0 md:hidden">
              <ToolButton
                onClick={() => {
                  if (!showLayersMenu && layersMenuRef.current) {
                    const r = layersMenuRef.current.getBoundingClientRect()
                    setLayersMenuPos({ top: r.bottom + 4, left: r.left })
                  }
                  setShowLayersMenu((v) => !v)
                }}
                icon={Layers}
                active={showLayersMenu}
                label="Layers"
              />
            </div>
            {showLayersMenu &&
              layersMenuPos &&
              createPortal(
                <div
                  style={{ top: layersMenuPos.top, left: layersMenuPos.left }}
                  className="fixed z-[1300] w-52 space-y-0.5 rounded-lg border border-fg/[0.1] bg-page p-1.5 shadow-2xl"
                >
                  <LayerMenuItem
                    onClick={() => {
                      useMyLocation()
                      setShowLayersMenu(false)
                    }}
                    icon={LocateFixed}
                    label="My location"
                  />
                  <LayerMenuItem
                    onClick={() => {
                      toggleFollow()
                      setShowLayersMenu(false)
                    }}
                    icon={Navigation}
                    active={following}
                    label={following ? `Following${gpsAccuracyYds != null ? ` ±${gpsAccuracyYds} yd` : "…"}` : "Follow GPS"}
                  />
                  <LayerMenuItem
                    onClick={() => {
                      setShowTrouble((v) => !v)
                      setShowLayersMenu(false)
                    }}
                    icon={Layers}
                    active={showTrouble}
                    label="Trouble map"
                  />
                  <LayerMenuItem
                    onClick={() => {
                      setShowRings((v) => !v)
                      setShowLayersMenu(false)
                    }}
                    icon={Target}
                    active={showRings}
                    label="Shot rings"
                  />
                  {zones.length > 0 && (
                    <LayerMenuItem
                      onClick={() => {
                        setShowZones((v) => !v)
                        setShowLayersMenu(false)
                      }}
                      icon={Eye}
                      active={showZones}
                      label="My marks"
                    />
                  )}
                </div>,
                document.body
              )}
            <ToolButton onClick={useMyLocation} icon={LocateFixed} label="My location" hideOnMobile />
            <ToolButton
              onClick={toggleFollow}
              icon={Navigation}
              active={following}
              label={following ? `Following${gpsAccuracyYds != null ? ` ±${gpsAccuracyYds} yd` : "…"}` : "Follow GPS"}
              hideOnMobile
            />
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
            <span className="hidden h-5 w-px shrink-0 bg-fg/[0.1] md:block" />
            <ToolButton
              onClick={() => setShowTrouble((v) => !v)}
              icon={Layers}
              active={showTrouble}
              label="Trouble map"
              title="Colour every spot by strokes lost or gained versus a fairway lie at the same distance"
              hideOnMobile
            />
            <ToolButton
              onClick={() => setShowRings((v) => !v)}
              icon={Target}
              active={showRings}
              label="Shot rings"
              title="Show where 50% and 90% of this club's shots land"
              hideOnMobile
            />
            {zones.length > 0 && (
              <ToolButton
                onClick={() => setShowZones((v) => !v)}
                icon={Eye}
                active={showZones}
                label="My marks"
                title="Show or hide your hand-drawn marks (separate from the course map itself)"
                hideOnMobile
              />
            )}
            <label className="ml-auto flex shrink-0 items-center gap-1.5 text-muted">
              <Pencil size={13} />
              <select
                value={drawKind ?? ""}
                onChange={(e) => (e.target.value ? startDraw(e.target.value as Lie) : cancelDraw())}
                title="Outline trees, water, out of bounds or a safe area the map doesn't show (or gets wrong) so the aim and strokes gained account for it"
                className="rounded-md border border-fg/[0.08] bg-page px-1.5 py-1.5 text-fg-3"
              >
                <option value="">Mark area…</option>
                {DRAW_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {LIE_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {gpsError && <span className="shrink-0 text-danger">{gpsError}</span>}
          </div>

          {drawKind && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: lieColor(drawKind, 0.33), backgroundColor: lieColor(drawKind, 0.08) }}
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lieColor(drawKind) }} />
              <span className="text-fg-2">
                Tap the map to outline the <strong>{LIE_LABEL[drawKind].toLowerCase()}</strong> area
                {pendingPoints.length > 0 ? ` — ${pendingPoints.length} point${pendingPoints.length === 1 ? "" : "s"}` : ""}.
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
            className="relative h-[60svh] min-h-[380px] overflow-hidden rounded-2xl border border-fg/[0.07] bg-page shadow-lg shadow-black/30 md:h-[70vh] md:min-h-[460px]"
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
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <MapIcon size={26} />
                </span>
                <p className="text-sm font-medium text-fg">Load a course to plan your shots</p>
                <p className="max-w-xs text-xs text-muted">
                  Search above, pick a hole, then drag the ball anywhere. Every club is simulated with your own dispersion.
                </p>
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
                    <p className={`font-bold text-white ${cell.small ? "truncate text-sm" : "text-lg leading-tight"}`}>{cell.v}</p>
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
                  className="flex items-center gap-1 rounded-full border border-white/25 bg-black/80 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm disabled:opacity-30"
                >
                  <Undo2 size={13} /> Undo
                </button>
                <button
                  onClick={finishDraw}
                  disabled={pendingPoints.length < 3}
                  className="flex items-center gap-1 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-on-accent shadow-lg disabled:opacity-30"
                >
                  <Check size={13} /> Finish
                </button>
                <button onClick={cancelDraw} className="flex items-center gap-1 rounded-full border border-white/25 bg-black/80 px-3 py-2 text-xs font-medium text-white backdrop-blur-sm">
                  <X size={13} /> Cancel
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-fg-3">
            {LIES.map((l) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-black/60" style={{ background: lieColor(l) }} />
                {LIE_LABEL[l]}
              </span>
            ))}
            {showTrouble && (
              <span className="flex items-center gap-1.5 text-fg-2">
                <span className="inline-block h-2.5 w-14 rounded-full" style={{ background: `linear-gradient(90deg, ${cssColor("map-better")}, ${cssColor("map-marker", 0.2)}, ${cssColor("map-caution")}, ${cssColor("map-worse")})` }} />
                better ← vs fairway → worse
              </span>
            )}
            <span className="text-muted">B = ball · A = aim · P = pin (drag any). Dots: {DOTS_SHOWN} simulated shots. Ctrl/⌘ + scroll zooms the map.</span>
          </div>

          {localOnlyZones && localOnlyZones.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2 text-xs text-fg-2">
              <span>
                You have {localOnlyZones.length} mark{localOnlyZones.length === 1 ? "" : "s"} saved on this device from
                before signing in.
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
              <span className="text-muted">
                Your marks{authUser ? " (synced to your account)" : " (saved on this device only)"}:
              </span>
              {!authUser && (
                <Link href="/login" className="text-accent hover:underline">
                  Sign in to sync
                </Link>
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

        {/* ---- shot plan (tablet/desktop: everything inline, including the table) ---- */}
        <aside className="hidden min-w-0 space-y-3 md:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {!planReady ? (
            howItWorksCard
          ) : (
            <>
              {planCard}
              {clubTable}
              {scoringDetails}
            </>
          )}
        </aside>

        {/* ---- shot plan (phone: table moves into a bottom sheet so the map stays dominant) ---- */}
        <div className="min-w-0 space-y-3 md:hidden">{!planReady ? howItWorksCard : <>{planCard}{scoringDetails}</>}</div>
      </div>

      {planReady && ranking.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 flex flex-col overflow-hidden rounded-t-2xl border border-b-0 border-fg/[0.1] bg-surface shadow-[0_-8px_24px_rgba(0,0,0,0.45)] transition-[max-height] duration-200 md:hidden"
          style={{ maxHeight: sheetOpen ? "min(65vh, 26rem)" : "3.25rem" }}
        >
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 text-left"
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate text-xs">
              <span className="font-semibold text-fg">{chosen?.club ?? "–"}</span>
              <span className="text-muted">·</span>
              <span className="text-fg-3">{chosen ? `${Math.round(chosen.meanCarryYds)}y` : "–"}</span>
              <span className="text-muted">·</span>
              <span className="text-fg-3">{distPin != null ? `${Math.round(distPin)} to pin` : "–"}</span>
              <span className="text-muted">·</span>
              <span className="text-fg-3">{chosen ? `${chosen.expectedStrokes.toFixed(2)} strokes` : "–"}</span>
            </span>
            <ChevronDown size={16} className={`shrink-0 text-fg-3 transition-transform ${sheetOpen ? "" : "rotate-180"}`} />
          </button>
          <div className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">{clubTable}</div>
        </div>
      )}

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

function StatTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl bg-fg/[0.04] px-2 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-xl font-bold leading-tight text-fg">
        {value ?? "–"}
        <span className="ml-0.5 text-xs font-normal text-muted">yd</span>
      </p>
    </div>
  )
}

function ToolButton({
  onClick,
  icon: Icon,
  label,
  active,
  title,
  hideOnMobile,
}: {
  onClick: () => void
  icon: LucideIcon
  label: string
  active?: boolean
  title?: string
  hideOnMobile?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`${hideOnMobile ? "hidden md:flex" : "flex"} shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 font-medium transition-colors md:py-1.5 ${
        active ? "border-accent bg-accent/15 text-accent" : "border-fg/[0.08] text-fg-3 hover:border-fg/20 hover:text-fg"
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

// A ToolButton-alike for inside the phone-only "Layers" overflow menu: full-width, closes the menu on tap.
function LayerMenuItem({
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
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium ${
        active ? "bg-accent/15 text-accent" : "text-fg-2 hover:bg-fg/[0.06] hover:text-fg"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
      <Info size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
