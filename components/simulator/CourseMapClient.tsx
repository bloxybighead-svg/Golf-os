"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  bearingDeg,
  distanceYds,
  landingPoint,
  lineLengthYds,
  pointAlongLine,
  ringCentroid,
  type LatLng,
} from "@/lib/course/geo"
import { buildLieMap, type Lie } from "@/lib/course/lies"
import type { CourseGeometry, CourseHole } from "@/lib/course/overpass"
import { bestAim, rankClubs, simulateLandings, type ClubShots } from "@/lib/course/plan"
import { seededSample } from "@/lib/dispersion/stats"
import { generateCustomGolferShots } from "@/lib/golfer/build"
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
const LIES: Lie[] = ["green", "fairway", "rough", "bunker", "water"]
const LIE_LABEL: Record<Lie, string> = { green: "Green", fairway: "Fairway", rough: "Rough", bunker: "Bunker", water: "Water" }

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

  // --- positions ---
  const [holeId, setHoleId] = useState<string | null>(null)
  const [ball, setBall] = useState<LatLng | null>(null)
  const [aimManual, setAimManual] = useState<LatLng | null>(null)
  const [pinManual, setPinManual] = useState<LatLng | null>(null)
  const [placing, setPlacing] = useState<Placing>("ball")
  const [clubChoice, setClubChoice] = useState<string>("auto")
  const [aimNote, setAimNote] = useState<string | null>(null)
  const [gpsError, setGpsError] = useState("")
  const [fit, setFit] = useState<{ bounds: [[number, number], [number, number]] | null; key: string }>({
    bounds: null,
    key: "none",
  })

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
    setLoadState("loading")
    setLoadError("")
    // The free map-data servers are often busy. The API route keeps whatever
    // it already fetched, so retrying picks up where the last try stopped.
    const url = `/api/courses/geometry?lat=${c.lat}&lng=${c.lng}&name=${encodeURIComponent(c.name)}&id=${encodeURIComponent(c.id)}`
    let lastError = "Could not load course map data"
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) setLoadError(`Map data server is busy, retrying (${attempt + 1}/3)…`)
      try {
        const res = await fetch(url)
        const data = await res.json().catch(() => null)
        if (!res.ok || !data) throw new Error(data?.error ?? lastError)
        const g = { ...(data as CourseGeometry), coast: (data as CourseGeometry).coast ?? [] }
        setGeometry(g)
        const pts: LatLng[] = g.holes.flatMap((h) => h.line)
        setFit({ bounds: boundsOf(pts.length ? pts : [{ lat: c.lat, lng: c.lng }]), key: `course-${c.id}` })
        setLoadError("")
        setLoadState("idle")
        return
      } catch (e) {
        lastError = e instanceof Error ? e.message : lastError
      }
    }
    setLoadState("error")
    setLoadError(lastError)
  }

  // ---------- golfer shots ----------
  const clubShots: ClubShots[] = useMemo(() => {
    if (source === "calibrated" && calibrated) {
      return calibrated.map((c) => ({ club: c.club, shots: c.shots }))
    }
    const all = generateCustomGolferShots({ handicapIndex: handicap }, HANDICAP_SHOTS_PER_CLUB * 12, 42)
    const by = new Map<string, { carryYds: number; offlineYds: number }[]>()
    for (const s of all) {
      const list = by.get(s.club) ?? []
      list.push({ carryYds: s.carryYds, offlineYds: s.offlineYds })
      by.set(s.club, list)
    }
    return Array.from(by, ([club, shots]) => ({ club, shots }))
  }, [source, calibrated, handicap])

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
    if (hole && ball && distanceYds(ball, hole.line[0]) < 25 && lineLengthYds(hole.line) > longestCarry + 40) {
      return pointAlongLine(hole.line, longestCarry)
    }
    return pin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole, ball, pin, longestCarry])
  const aim = aimManual ?? defaultAim

  // ---------- planning ----------
  const lies = useMemo(
    () => (course?.lat != null && course.lng != null ? buildLieMap({ lat: course.lat, lng: course.lng }, geometry?.features ?? [], geometry?.coast ?? []) : null),
    [course, geometry]
  )

  const ranking = useMemo(() => {
    if (!ball || !aim || !pin || !lies) return []
    return rankClubs(clubShots, { from: ball, aim, pin, lies })
  }, [ball, aim, pin, lies, clubShots])

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
    return { greens: count("green"), fairways: count("fairway"), bunkers: count("bunker"), water: count("water") }
  }, [geometry])

  const distPin = ball && pin ? distanceYds(ball, pin) : null
  const distAim = ball && aim ? distanceYds(ball, aim) : null
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
        <Link href="/simulator" className="text-xs text-[#22c55e] hover:underline">
          &larr; Dispersion Simulator
        </Link>
      </div>

      {/* controls */}
      <div className="grid gap-3 rounded-xl border border-white/[0.06] bg-[#111111] p-4 md:grid-cols-[1fr_auto]">
        <div className="relative">
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

        <div className="flex flex-wrap items-end gap-3">
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
              {stats.water} water
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
        <div className="flex flex-wrap gap-1.5">
          {holes.map((h, i) => (
            <button
              key={h.id}
              onClick={() => pickHole(h)}
              title={h.par ? `Par ${h.par}` : undefined}
              className={`min-w-[2.25rem] rounded-md border px-2 py-1 text-xs font-medium ${
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
        {/* map */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#6b7280]">Click the map to place:</span>
            {(["ball", "aim", "pin"] as Placing[]).map((p) => (
              <button
                key={p}
                onClick={() => setPlacing(p)}
                className={`rounded-md border px-2.5 py-1 font-medium capitalize ${
                  placing === p ? "border-[#22c55e] bg-[#22c55e]/15 text-[#22c55e]" : "border-white/[0.08] text-[#9ca3af] hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={useMyLocation}
              className="rounded-md border border-white/[0.08] px-2.5 py-1 font-medium text-[#9ca3af] hover:text-white"
            >
              Use my location
            </button>
            {aimManual && (
              <button
                onClick={() => {
                  setAimManual(null)
                  setAimNote(null)
                }}
                className="rounded-md border border-white/[0.08] px-2.5 py-1 font-medium text-[#9ca3af] hover:text-white"
              >
                Reset aim
              </button>
            )}
            {gpsError && <span className="text-red-400">{gpsError}</span>}
          </div>
          <div className="relative h-[68vh] min-h-[420px] overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0a0a]">
            {course?.lat != null && course.lng != null ? (
              <CourseMap
                center={{ lat: course.lat, lng: course.lng }}
                geometry={geometry}
                selectedHoleId={holeId}
                ball={ball}
                aim={aim}
                pin={pin}
                landings={landings}
                placing={placing}
                fitBounds={fit.bounds}
                fitKey={fit.key}
                onBall={(p) => {
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
        <div className="space-y-3">
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
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs text-[#6b7280]">
                    {hole ? `Hole ${hole.ref ?? "?"}${hole.par ? ` · par ${hole.par}` : ""} · ` : ""}
                    {distPin != null && <>pin {Math.round(distPin)} yd</>}
                    {distAim != null && aim !== pin && <> · aim {Math.round(distAim)} yd</>}
                  </p>
                </div>
                {best && (
                  <p className="mt-2 text-lg font-bold text-white">
                    Best club: <span className="text-[#22c55e]">{best.club}</span>
                    <span className="ml-2 text-xs font-normal text-[#6b7280]">
                      avg {Math.round(best.meanCarryYds)} yd carry · {best.expectedStrokes.toFixed(2)} expected strokes
                    </span>
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

              <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#111111]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-left text-[#6b7280]">
                      <th className="px-2 py-2 font-medium">Club</th>
                      <th className="px-1 py-2 text-right font-medium">Carry</th>
                      {LIES.map((l) => (
                        <th key={l} className="px-1 py-2 text-right font-medium" title={LIE_LABEL[l]}>
                          {LIE_LABEL[l].slice(0, 3)}
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
                        className={`cursor-pointer border-b border-white/[0.04] last:border-0 hover:bg-white/[0.04] ${
                          chosen?.club === r.club ? "bg-[#22c55e]/10" : ""
                        }`}
                      >
                        <td className="px-2 py-1.5 text-white">
                          {r.club}
                          {i === 0 && <span className="ml-1 text-[10px] text-[#22c55e]">★</span>}
                        </td>
                        <td className="px-1 py-1.5 text-right text-[#9ca3af]">{Math.round(r.meanCarryYds)}</td>
                        {LIES.map((l) => (
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
                Clubs are ranked by expected strokes to hole out from where each simulated shot lands. The stroke
                values are approximate placeholders (not yet tied to a published strokes-gained table) and the course
                shapes come from OpenStreetMap volunteers, so treat close calls as ties. Trees, slope, wind and
                elevation aren&rsquo;t modelled; anything not traced as green, fairway, bunker or water counts as rough.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
