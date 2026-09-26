"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  bearingDeg,
  distanceYds,
  landingPoint,
  ringCentroid,
  toLocal,
  type LatLng,
} from "@/lib/course/geo"
import { defaultTeeAim } from "@/lib/course/aim"
import { buildLieMap, type Lie } from "@/lib/course/lies"
import { GEOMETRY_VERSION, type CourseGeometry, type CourseHole } from "@/lib/course/overpass"
import { bestAim, rankClubs, simulateLandings, type ClubShots } from "@/lib/course/plan"
import { seededSample } from "@/lib/dispersion/stats"
import { generateCustomGolferShots, type Tendency } from "@/lib/golfer/build"
import type { Club } from "@/lib/golfer/tables"
import { TendencyPicker } from "./TendencyPicker"
import { LIE_COLORS, type Placing } from "./courseColors"

const CourseMap = dynamic(() => import("./CourseMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-[#6b7280]">Loading map…</div>,
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

const DOTS_SHOWN = 400
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
const ALWAYS_SHOWN: Lie[] = ["green", "fairway", "rough"]
const CORRIDOR_OPTIONS = [0, 30, 40, 50, 60] // yards each side of the hole line; 0 = off
const SETTINGS_KEY = "golfos.planner.v1"
const RECENT_KEY = "golfos.recentCourses.v1"
const COURSE_CACHE_MAX_AGE_MS = 30 * 24 * 3600 * 1000
const YD_PER_M = 1.09361
const SIDES = ["auto", "straight", "left", "right", "both"]
const STRENGTHS = ["slight", "moderate", "strong"]

/** Distance in yards from a point to a polyline (planar approximation, fine at hole scale). */
function distanceToLine(p: LatLng, line: LatLng[]): number {
  const pt = toLocal(p, p) // origin at p
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const a = toLocal(p, line[i - 1])
    const b = toLocal(p, line[i])
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(a.x + t * dx - pt.x, a.y + t * dy - pt.y))
  }
  return best
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
  const [corridorYds, setCorridorYds] = useState(40)
  const [showSettings, setShowSettings] = useState(false) // phones: golfer settings are collapsed by default
  const [recent, setRecent] = useState<CourseHit[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [following, setFollowing] = useState(false)
  const [gpsAccuracyYds, setGpsAccuracyYds] = useState<number | null>(null)
  const mapWrapRef = useRef<HTMLDivElement>(null)
  const watchId = useRef<number | null>(null)
  const lastFollowAt = useRef(0)
  const [aimNote, setAimNote] = useState<string | null>(null)
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
        if (CORRIDOR_OPTIONS.includes(v.corridorYds)) setCorridorYds(v.corridorYds)
      }
      const r = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
      if (Array.isArray(r)) setRecent(r.filter((c) => c && typeof c.id === "string" && typeof c.name === "string").slice(0, 5))
    } catch {
      /* private mode or corrupt data: start from defaults */
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ source, handicap, driverCarry, sevenIronCarry, tendency, corridorYds }))
    } catch {
      /* storage full or blocked: settings just won't be remembered */
    }
  }, [hydrated, source, handicap, driverCarry, sevenIronCarry, tendency, corridorYds])

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

  async function loadCourse(c: CourseHit) {
    setCourse(c)
    setHits([])
    setGeometry(null)
    setHoleId(null)
    setBall(null)
    setAimManual(null)
    setPinManual(null)
    setAimNote(null)
    if (c.lat == null || c.lng == null) {
      setLoadState("error")
      setLoadError("This course has no coordinates in the course database, so it can't be placed on the map.")
      return
    }
    remember(c)
    const cacheKey = `golfos.course.${c.id}.v${GEOMETRY_VERSION}`
    const apply = (g: CourseGeometry) => {
      setGeometry(g)
      const pts: LatLng[] = g.holes.flatMap((h) => h.line)
      setFit({ bounds: boundsOf(pts.length ? pts : [{ lat: c.lat as number, lng: c.lng as number }]), key: `course-${c.id}` })
      setLoadError("")
      setLoadState("idle")
    }
    // Saved on this device (great for a round with weak signal): use it if it is recent.
    let stale: CourseGeometry | null = null
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
    setLoadState("loading")
    setLoadError("")
    // The free map-data servers are often busy. The API route keeps whatever
    // it already fetched, so retrying picks up where the last try stopped.
    const url = `/api/courses/geometry?lat=${c.lat}&lng=${c.lng}&name=${encodeURIComponent(c.name)}&id=${encodeURIComponent(c.id)}&v=${GEOMETRY_VERSION}`
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
    // On a phone the map is below the hole strip: bring it into view after picking a hole.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setTimeout(() => mapWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60)
    }
    setHoleId(h.id)
    setBall(h.line[0])
    setAimManual(null)
    setPinManual(null)
    setAimNote(null)
    setClubChoice("auto")
    setFit({ bounds: boundsOf([...h.line, holePinFor(h)]), key: `hole-${h.id}` })
  }

  const pin: LatLng | null = pinManual ?? (hole ? holePinFor(hole) : null)

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

  // ---------- planning ----------
  // The corridor only makes sense while the ball is inside it (someone
  // standing in the trees shouldn't have every shot count as trees).
  const corridor = useMemo(() => {
    if (!hole || corridorYds === 0 || !ball) return undefined
    const local = (p: LatLng) => distanceToLine(p, hole.line)
    return local(ball) > corridorYds ? undefined : { line: hole.line, halfWidthYds: corridorYds }
  }, [hole, corridorYds, ball])

  const lies = useMemo(
    () =>
      course?.lat != null && course.lng != null
        ? buildLieMap({ lat: course.lat, lng: course.lng }, geometry?.features ?? [], geometry?.coast ?? [], corridor)
        : null,
    [course, geometry, corridor]
  )

  const ranking = useMemo(() => {
    if (!ball || !aim || !pin || !lies) return []
    return rankClubs(clubShots, { from: ball, aim, pin, lies })
  }, [ball, aim, pin, lies, clubShots])

  const shownLies = LIES.filter((l) => ALWAYS_SHOWN.includes(l) || ranking.some((r) => r.lieShare[l] >= 0.005))
  const chosen = ranking.find((r) => r.club === clubChoice) ?? ranking[0] ?? null
  const chosenShots = chosen ? clubShots.find((c) => c.club === chosen.club) : undefined

  const landings = useMemo(() => {
    if (!chosenShots || !ball || !aim || !lies) return []
    return simulateLandings(seededSample(chosenShots.shots, DOTS_SHOWN, 3), ball, bearingDeg(ball, aim), lies)
  }, [chosenShots, ball, aim, lies])

  function findBestAim() {
    if (!chosenShots || !ball || !aim || !pin || !lies) return
    const r = bestAim(chosenShots, { from: ball, aim, pin, lies })
    const dist = distanceYds(ball, aim)
    setAimManual(landingPoint(ball, r.bearingDeg, dist, 0))
    const saved = r.baselineStrokes - r.plan.expectedStrokes
    setAimNote(
      r.offsetYds === 0
        ? `Aiming where you are now is already best for the ${chosenShots.club}.`
        : `Best aim for the ${chosenShots.club}: ${Math.abs(r.offsetYds)} yd ${r.offsetYds < 0 ? "left" : "right"} of the old aim, ` +
            `saving about ${saved.toFixed(2)} strokes (measured on the same shots it was picked on, so a little optimistic).`
    )
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Course Planner</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Pick any course, stand anywhere, and see where each club&rsquo;s simulated shots land on the real hole.
          </p>
        </div>
      </div>

      {/* controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-[#111111] p-4">
        <div className="relative max-w-xl">
          <label className="text-xs font-medium text-[#6b7280]">Course</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={course ? `${course.name} — search another…` : "Search a course, e.g. Pebble Beach"}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
          />
          {(hits.length > 0 || searching || (searched && query.trim().length >= 3)) && (
            <div className="absolute z-[1200] mt-1 max-h-64 w-full overflow-auto rounded-lg border border-white/[0.1] bg-[#0a0a0a] shadow-xl">
              {searching && hits.length === 0 && <p className="px-3 py-2 text-xs text-[#6b7280]">Searching…</p>}
              {!searching && hits.length === 0 && <p className="px-3 py-2 text-xs text-[#6b7280]">No courses found. Try fewer words.</p>}
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setQuery("")
                    loadCourse(h)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-white hover:bg-white/[0.06]"
                >
                  {h.name}
                  <span className="ml-2 text-xs text-[#6b7280]">
                    {[h.city, h.state].filter(Boolean).join(", ")}
                    {h.par ? ` · par ${h.par}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {recent.length > 0 && (
          <div className="no-scrollbar -mt-2 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
            <span className="text-xs text-[#6b7280]">Recent:</span>
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => loadCourse(r)}
                className="shrink-0 rounded-full border border-white/[0.08] px-3 py-1.5 text-xs text-[#d1d5db] hover:border-[#22c55e]/50"
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-left text-sm text-[#d1d5db] md:hidden"
        >
          <span>
            <span className="text-[#6b7280]">Golfer: </span>
            {source === "calibrated" ? calibratedName : `Handicap ${handicap}`}
          </span>
          <span className="text-xs text-[#22c55e]">{showSettings ? "Hide" : "Change"}</span>
        </button>
        <div className={`${showSettings ? "flex" : "hidden"} flex-wrap items-end gap-3 md:flex`}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[#6b7280]">Golfer</span>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value as "calibrated" | "handicap")
                setClubChoice("auto")
                setAimNote(null)
              }}
              className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
            >
              {calibrated && <option value="calibrated">{calibratedName} (calibrated)</option>}
              <option value="handicap">Handicap-based golfer</option>
            </select>
          </label>
          {source === "handicap" && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[#6b7280]">Handicap</span>
                <input
                  type="number"
                  min={0}
                  max={36}
                  step={1}
                  value={handicap}
                  onChange={(e) => {
                    setHandicap(Math.min(36, Math.max(0, Number(e.target.value) || 0)))
                    setAimNote(null)
                  }}
                  className="w-20 rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[#6b7280]">Driver carry (yd)</span>
                <input
                  type="number"
                  placeholder="avg"
                  inputMode="numeric"
                  value={driverCarry}
                  onChange={(e) => {
                    setDriverCarry(e.target.value)
                    setAimNote(null)
                  }}
                  className="w-24 rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white placeholder:text-[#4b5563]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[#6b7280]">7-iron carry (yd)</span>
                <input
                  type="number"
                  placeholder="avg"
                  inputMode="numeric"
                  value={sevenIronCarry}
                  onChange={(e) => {
                    setSevenIronCarry(e.target.value)
                    setAimNote(null)
                  }}
                  className="w-24 rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white placeholder:text-[#4b5563]"
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

      {course && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#9ca3af]">
          <span className="font-semibold text-white">{course.name}</span>
          {loadState === "loading" && <span>{loadError || "Loading map data…"}</span>}
          {loadState === "error" && (
            <>
              <span className="text-red-400">{loadError}</span>
              <button onClick={() => loadCourse(course)} className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[#9ca3af] hover:text-white">
                Retry
              </button>
            </>
          )}
          {geometry && (
            <span>
              {holes.length} holes · {stats.greens} greens · {stats.fairways} fairways · {stats.bunkers} bunkers ·{" "}
              {stats.water} water · {stats.trees} tree areas{stats.range > 0 ? ` · ${stats.range} range/practice` : ""}
            </span>
          )}
        </div>
      )}

      {geometry && geometry.scope === "radius" && (
        <p className="rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-500">
          No course boundary is mapped for this course, so this shows everything within about a mile. Neighbouring
          courses may appear.
        </p>
      )}
      {geometry && holes.length === 0 && (
        <p className="rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-500">
          No hole lines are mapped for this course in OpenStreetMap. You can still place the ball and the pin by hand.
        </p>
      )}
      {geometry && holes.length > 0 && stats.greens === 0 && (
        <p className="rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-3 py-2 text-xs text-yellow-500">
          Greens, fairways and hazards aren&rsquo;t traced for this course, so almost everything will count as rough and
          the club ranking is only a distance guide.
        </p>
      )}

      {holes.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {holes.map((h, i) => (
            <button
              key={h.id}
              id={`hole-btn-${h.id}`}
              onClick={() => pickHole(h)}
              title={h.par ? `Par ${h.par}` : undefined}
              className={`min-w-[2.75rem] shrink-0 rounded-md border px-2 py-2 text-sm font-medium md:min-w-[2.25rem] md:py-1 md:text-xs ${
                h.id === holeId
                  ? "border-[#22c55e] bg-[#22c55e]/15 text-[#22c55e]"
                  : "border-white/[0.08] text-[#9ca3af] hover:text-white"
              }`}
            >
              {h.ref ?? i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
        {/* map (min-w-0 stops the scrolling toolbar from stretching the whole page on phones) */}
        <div className="min-w-0 space-y-2">
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto whitespace-nowrap text-xs md:flex-wrap md:overflow-visible">
            <span className="shrink-0 text-[#6b7280]">Tap the map to place:</span>
            {(["ball", "aim", "pin"] as Placing[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlacing(p)}
                className={`shrink-0 rounded-md border px-3 py-2 font-medium capitalize md:px-2.5 md:py-1 ${
                  placing === p ? "border-[#22c55e] bg-[#22c55e]/15 text-[#22c55e]" : "border-white/[0.08] text-[#9ca3af] hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={useMyLocation}
              className="shrink-0 rounded-md border border-white/[0.08] px-3 py-2 font-medium text-[#9ca3af] hover:text-white md:px-2.5 md:py-1"
            >
              Use my location
            </button>
            <button
              onClick={toggleFollow}
              aria-pressed={following}
              className={`shrink-0 rounded-md border px-3 py-2 font-medium md:px-2.5 md:py-1 ${
                following ? "border-[#22c55e] bg-[#22c55e]/15 text-[#22c55e]" : "border-white/[0.08] text-[#9ca3af] hover:text-white"
              }`}
            >
              {following ? `Following GPS${gpsAccuracyYds != null ? ` ±${gpsAccuracyYds} yd` : "…"}` : "Follow my GPS"}
            </button>
            {aimManual && (
              <button
                onClick={() => {
                  setAimManual(null)
                  setAimNote(null)
                }}
                className="shrink-0 rounded-md border border-white/[0.08] px-3 py-2 font-medium text-[#9ca3af] hover:text-white md:px-2.5 md:py-1"
              >
                Reset aim
              </button>
            )}
            <label className="ml-auto flex shrink-0 items-center gap-1.5 text-[#6b7280]" title="Many courses have no trees mapped. Land farther than this from the hole line, and not mapped as anything else, counts as trees (punch-out).">
              Trees beyond
              <select
                value={corridorYds}
                onChange={(e) => {
                  setCorridorYds(Number(e.target.value))
                  setAimNote(null)
                }}
                className="rounded-md border border-white/[0.08] bg-[#0a0a0a] px-1.5 py-1.5 text-[#9ca3af]"
              >
                {CORRIDOR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y === 0 ? "off" : `${y} yd`}
                  </option>
                ))}
              </select>
              of hole line
            </label>
            {gpsError && <span className="text-red-400">{gpsError}</span>}
          </div>
          <div ref={mapWrapRef} className="relative h-[60svh] min-h-[380px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0a0a] md:h-[68vh] md:min-h-[420px]">
            {course?.lat != null && course.lng != null ? (
              <CourseMap
                center={{ lat: course.lat, lng: course.lng }}
                geometry={geometry}
                selectedHoleId={holeId}
                ball={ball}
                aim={aim}
                pin={pin}
                landings={landings}
                labels={labels}
                placing={placing}
                fitBounds={fit.bounds}
                fitKey={fit.key}
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
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-[#6b7280]">
                Search for a course above to load its satellite map.
              </div>
            )}
            {/* Phone HUD: the numbers you need mid-round, on the map itself */}
            {ball && pin && distPin != null && (
              <div className="pointer-events-none absolute bottom-7 left-2 right-2 z-[1100] grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-white/20 bg-white/10 text-center backdrop-blur-sm md:hidden">
                {[
                  { k: "Club", v: chosen?.club ?? "–", small: true },
                  { k: "To aim", v: distAim != null ? `${Math.round(distAim)}` : "–" },
                  { k: aimIsPin ? "Pin" : "Left", v: aimIsPin ? "0" : aimToPin != null ? `${Math.round(aimToPin)}` : "–" },
                  { k: "To pin", v: `${Math.round(distPin)}` },
                ].map((cell) => (
                  <div key={cell.k} className="bg-black/75 px-1 py-1.5">
                    <p className="text-[9px] uppercase tracking-wide text-[#9ca3af]">{cell.k}</p>
                    <p className={`font-bold text-white ${cell.small ? "truncate text-sm" : "text-lg leading-tight"}`}>{cell.v}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#9ca3af]">
            {LIES.map((l) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-black/60" style={{ background: LIE_COLORS[l] }} />
                {LIE_LABEL[l]}
              </span>
            ))}
            <span className="text-[#6b7280]">
              B = ball · A = aim · P = pin (drag any of them). Dots are {DOTS_SHOWN} simulated shots.
            </span>
          </div>
        </div>

        {/* results */}
        <div className="min-w-0 space-y-3">
          {!ball || !pin ? (
            <div className="rounded-xl border border-white/[0.06] bg-[#111111] p-4 text-sm text-[#9ca3af]">
              {holes.length > 0
                ? "Pick a hole number (or click a hole line on the map) to stand on its tee, then drag the ball anywhere."
                : course
                  ? "Set the ball, then the pin, using the buttons above the map."
                  : "Search for a course to begin."}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-white/[0.06] bg-[#111111] p-4">
                <p className="text-xs text-[#6b7280]">
                  {hole ? `Hole ${hole.ref ?? "?"}${hole.par ? ` · par ${hole.par}` : ""}` : "Free placement"}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/[0.04] px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-[#6b7280]">Ball to aim</p>
                    <p className="text-lg font-bold text-white">{distAim != null ? Math.round(distAim) : "–"}<span className="ml-0.5 text-xs font-normal text-[#6b7280]">yd</span></p>
                  </div>
                  <div className="rounded-lg bg-white/[0.04] px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-[#6b7280]">{aimIsPin ? "Aim is the pin" : "Left after aim"}</p>
                    <p className="text-lg font-bold text-white">{aimIsPin ? "0" : aimToPin != null ? Math.round(aimToPin) : "–"}<span className="ml-0.5 text-xs font-normal text-[#6b7280]">yd</span></p>
                  </div>
                  <div className="rounded-lg bg-white/[0.04] px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-[#6b7280]">Ball to pin</p>
                    <p className="text-lg font-bold text-white">{distPin != null ? Math.round(distPin) : "–"}<span className="ml-0.5 text-xs font-normal text-[#6b7280]">yd</span></p>
                  </div>
                </div>
                {best && (
                  <p className="mt-2 text-lg font-bold text-white">
                    Best club: <span className="text-[#22c55e]">{best.club}</span>
                    <span className="ml-2 text-xs font-normal text-[#6b7280]">
                      avg {Math.round(best.meanCarryYds)} yd carry · {best.expectedStrokes.toFixed(2)} expected strokes
                    </span>
                  </p>
                )}
                {chosen && avgLeft != null && (
                  <p className="mt-1 text-xs text-[#9ca3af]">
                    {chosen.club} averages {Math.round(chosen.meanCarryYds)} yd, leaving about{" "}
                    <span className="font-semibold text-white">{Math.round(avgLeft)} yd</span> to the pin.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={findBestAim}
                    disabled={!chosen}
                    className="rounded-md border border-[#22c55e]/50 bg-[#22c55e]/10 px-2.5 py-1 text-xs font-medium text-[#22c55e] hover:bg-[#22c55e]/20 disabled:opacity-40"
                  >
                    Find best aim for {chosen?.club ?? "club"}
                  </button>
                  {clubChoice !== "auto" && (
                    <button
                      onClick={() => setClubChoice("auto")}
                      className="rounded-md border border-white/[0.08] px-2.5 py-1 text-xs text-[#9ca3af] hover:text-white"
                    >
                      Back to recommended
                    </button>
                  )}
                </div>
                {aimNote && <p className="mt-2 text-xs text-[#9ca3af]">{aimNote}</p>}
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#111111]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[#6b7280]">
                      <th className="px-2 py-2 font-medium">Club</th>
                      <th className="px-1 py-2 text-right font-medium">Carry</th>
                      {shownLies.map((l) => (
                        <th key={l} className="px-1 py-2 text-right font-medium" title={LIE_LABEL[l]}>
                          {LIE_SHORT[l]}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-right font-medium" title="This shot plus expected strokes remaining">
                        Strokes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr
                        key={r.club}
                        onClick={() => setClubChoice(r.club)}
                        className={`cursor-pointer border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] [&>td]:py-2.5 md:[&>td]:py-1.5 ${
                          chosen?.club === r.club ? "bg-[#22c55e]/10" : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-2 py-1.5 text-white">
                          {r.club}
                          {i === 0 && <span className="ml-1 text-[10px] text-[#22c55e]">★</span>}
                        </td>
                        <td className="px-1 py-1.5 text-right text-[#9ca3af]">{Math.round(r.meanCarryYds)}</td>
                        {shownLies.map((l) => (
                          <td key={l} className="px-1 py-1.5 text-right text-[#9ca3af]">
                            {pct(r.lieShare[l])}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right text-white">{r.expectedStrokes.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] leading-relaxed text-[#6b7280]">
                Clubs are ranked by expected strokes to hole out from where each simulated shot lands. Water,
                trees and out of bounds (a driving range or practice area) carry penalties; trees are mapped woods
                plus, optionally, anything farther than the chosen distance from the hole line, because many courses
                have no trees traced. The stroke values are approximate placeholders (not yet tied to a published
                strokes-gained table) and the course shapes come from OpenStreetMap volunteers, so treat close calls
                as ties. Slope, wind, elevation and individual trees aren&rsquo;t modelled; anything else unmapped
                counts as rough.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
