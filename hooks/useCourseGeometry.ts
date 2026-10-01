"use client"

// The Play planner's course: search, loading its map data (this device's cache,
// then /api/courses/geometry), "Refresh course data", and hole corrections
// (moved verbatim from CourseMapClient.tsx). What happens once a course's map
// data arrives (framing the map, standing on a hole) is the caller's `onApplied`,
// passed at call time so it sees exactly what it did before the split.

import { useEffect, useState } from "react"
import type { createClient } from "@/lib/supabase/client"
import { GEOMETRY_VERSION, type CourseGeometry, type CourseHole } from "@/lib/course/overpass"
import { COURSE_CACHE_MAX_AGE_MS, type CourseHit } from "@/lib/planner/storage"
import type { HoleCorrectionSubmission } from "@/components/simulator/EditHoleModal"
import type { AuthUser } from "./useAuthUser"

export type AutoHole = { autoHoleId?: string; autoHoleRef?: number; autoFirstHole?: boolean }
export type OnGeometryApplied = (g: CourseGeometry, c: CourseHit, opts?: { force?: boolean } & AutoHole) => void

export function useCourseGeometry() {
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

  /**
   * The actual geometry fetch: this device's cache, then the shared Supabase cache and
   * OpenStreetMap (both behind `/api/courses/geometry`), in that order. Split out from
   * `loadCourse` so "Refresh course data" can re-run just this half -- it should leave
   * the golfer's current ball/aim/pin exactly where they are, not reset the whole page
   * the way picking a *different* course does.
   */
  async function fetchGeometry(c: CourseHit, opts: ({ force?: boolean } & AutoHole) | undefined, onApplied: OnGeometryApplied) {
    const cacheKey = `golfos.course.${c.id}.v${GEOMETRY_VERSION}`
    const apply = (g: CourseGeometry) => {
      setGeometry(g)
      setLoadError("")
      setLoadState("idle")
      onApplied(g, c, opts)
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

  async function refreshCourseData(onApplied: OnGeometryApplied) {
    if (!course || refreshing) return
    setRefreshing(true)
    try {
      await fetchGeometry(course, { force: true }, onApplied)
    } finally {
      setRefreshing(false)
    }
  }

  // Corrections are global (course_key, hole_id, field_name), not per-user -- any
  // signed-in golfer can submit or overwrite one, so this is a plain upsert, not
  // scoped to the current account's own rows the way zones are.
  async function submitHoleCorrection(
    input: HoleCorrectionSubmission,
    ctx: { supabase: ReturnType<typeof createClient>; authUser: AuthUser | null; hole: CourseHole | null; onApplied: OnGeometryApplied }
  ) {
    const { authUser, hole } = ctx
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
      const { error } = await ctx.supabase.from("course_corrections").upsert(rows, { onConflict: "course_key,hole_id,field_name" })
      if (!error) {
        setEditingHole(false)
        setCorrectionNote("Correction submitted. This will help other golfers.")
        setTimeout(() => setCorrectionNote(null), 5000)
        await fetchGeometry(course, { force: true }, ctx.onApplied) // see the fix immediately, not after a manual reload
      }
    } finally {
      setCorrectionSubmitting(false)
    }
  }

  return {
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
    fetchGeometry,
    refreshCourseData,
    submitHoleCorrection,
  }
}
