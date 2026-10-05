"use client"

// The Play planner's course: search, loading its map data (this device's cache,
// then /api/courses/geometry), "Refresh course data", and hole corrections
// (moved verbatim from CourseMapClient.tsx). What happens once a course's map
// data arrives (framing the map, standing on a hole) is the caller's `onApplied`,
// passed at call time so it sees exactly what it did before the split.

import { useEffect, useMemo, useState } from "react"
import type { createClient } from "@/lib/supabase/client"
import { applyCorrections, type CorrectionRow } from "@/lib/course/corrections"
import { submitCorrection } from "@/app/courses/correction-actions"
import { GEOMETRY_VERSION, type CourseGeometry, type CourseHole } from "@/lib/course/overpass"
import { COURSE_CACHE_MAX_AGE_MS, type CourseHit } from "@/lib/planner/storage"
import type { HoleCorrectionSubmission } from "@/components/simulator/EditHoleModal"
import { loadCourseGeometry, saveCourseGeometry } from "@/lib/offline/snapshots"
import type { AuthUser } from "./useAuthUser"

export type AutoHole = { autoHoleId?: string; autoHoleRef?: number; autoFirstHole?: boolean }
export type OnGeometryApplied = (g: CourseGeometry, c: CourseHit, opts?: { force?: boolean } & AutoHole) => void

export function useCourseGeometry({ supabase, authUser }: { supabase: ReturnType<typeof createClient>; authUser: AuthUser | null }) {
  // --- course search / loading ---
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<CourseHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [course, setCourse] = useState<CourseHit | null>(null)
  const [sharedGeometry, setGeometry] = useState<CourseGeometry | null>(null)
  // This golfer's own corrections for the current course. Applied on top of the shared geometry
  // (which only carries corrections 2+ golfers agree on), so a lone correction affects only them.
  const [myCorrections, setMyCorrections] = useState<CorrectionRow[]>([])
  const geometry = useMemo(
    () => (sharedGeometry && myCorrections.length > 0 ? applyCorrections(sharedGeometry, myCorrections) : sharedGeometry),
    [sharedGeometry, myCorrections]
  )
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("idle")
  const [loadError, setLoadError] = useState("")
  const [refreshing, setRefreshing] = useState(false) // "Refresh course data": refetches geometry only, leaves ball/aim/pin alone
  const [initialZoom, setInitialZoom] = useState<number | undefined>(undefined) // remembered per course, initial view only
  const [editingHole, setEditingHole] = useState(false)
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false)
  const [correctionNote, setCorrectionNote] = useState<string | null>(null)
  // The last load was refused because it needs a signed-in golfer (a course not cached yet).
  const [loadNeedsSignIn, setLoadNeedsSignIn] = useState(false)
  const [searchError, setSearchError] = useState("")

  // ---------- this golfer's own corrections ----------
  // Fetched in the browser (owner-only table, so RLS returns just this user's rows) rather than
  // in the geometry route, which keeps that public, CDN-cached response free of per-user data.
  const courseId = course?.id
  useEffect(() => {
    setMyCorrections([])
    if (!courseId || !authUser) return
    let cancelled = false
    void supabase
      .from("course_corrections")
      .select("hole_id, field_name, corrected_value")
      .eq("course_key", `ogapi:${courseId}`)
      .then(({ data, error }) => {
        if (!cancelled && !error && data) setMyCorrections(data as CorrectionRow[])
      })
    return () => {
      cancelled = true
    }
  }, [courseId, authUser?.id, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

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
        setSearchError(res.ok ? "" : data?.error ?? "Search failed.")
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
      // Also kept in IndexedDB (roomier than localStorage, and what the offline round reads).
      if (g.scope === "course-area") void saveCourseGeometry(c.id, g)
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
    // No signal at all: go straight to the copy saved on this phone instead of waiting out three failed tries.
    if (!opts?.force && !navigator.onLine) {
      const saved = stale ?? (await loadCourseGeometry(c.id))
      if (saved) {
        apply({ ...saved, coast: saved.coast ?? [] })
        setLoadError("Offline: showing the copy saved on this phone.")
        return
      }
    }
    setLoadState("loading")
    setLoadError("")
    setLoadNeedsSignIn(false)
    // The free map-data servers are often busy, so a failed load is retried.
    // force=1 also skips the server's own (Supabase) cache, so a stale entry there gets replaced.
    // Not retried: 401 (a new course needs a signed-in golfer) and 429 (too many new courses this hour).
    const url = `/api/courses/geometry?lat=${c.lat}&lng=${c.lng}&name=${encodeURIComponent(c.name)}&id=${encodeURIComponent(c.id)}&v=${GEOMETRY_VERSION}${opts?.force ? "&force=1" : ""}`
    let lastError = "Could not load course map data"
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) setLoadError(`Map data server is busy, retrying (${attempt + 1}/3)…`)
      try {
        const res = await fetch(url)
        const data = await res.json().catch(() => null)
        if (res.status === 401 || res.status === 429) {
          lastError = data?.error ?? lastError
          setLoadNeedsSignIn(res.status === 401)
          break
        }
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
    const savedOffline = await loadCourseGeometry(c.id)
    if (savedOffline) {
      apply({ ...savedOffline, coast: savedOffline.coast ?? [] })
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

  // Saved through the submitCorrection server action (validated against the course data, written
  // with this golfer's own session). It applies to this golfer straight away; everyone else only
  // sees it once another golfer submits the same value. No geometry refetch: that would re-download
  // the whole course from OpenStreetMap and use one of the golfer's hourly loads for nothing.
  async function submitHoleCorrection(
    input: HoleCorrectionSubmission,
    ctx: { hole: CourseHole | null }
  ) {
    const { hole } = ctx
    if (!authUser || !course || !hole) return
    setCorrectionSubmitting(true)
    try {
      const res = await submitCorrection({ courseId: course.id, holeId: hole.id, ...input, reason: input.reason || undefined })
      if (!res.ok) {
        setCorrectionNote(res.error)
        setTimeout(() => setCorrectionNote(null), 5000)
        return
      }
      setMyCorrections((prev) => {
        const replaced = new Set(res.saved.map((r) => `${r.hole_id}|${r.field_name}`))
        return [...prev.filter((r) => !replaced.has(`${r.hole_id}|${r.field_name}`)), ...res.saved]
      })
      setEditingHole(false)
      setCorrectionNote("Saved for you. It applies for everyone once another golfer confirms it.")
      setTimeout(() => setCorrectionNote(null), 5000)
    } catch {
      setCorrectionNote("Could not save the correction. Try again.")
      setTimeout(() => setCorrectionNote(null), 5000)
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
    loadNeedsSignIn,
    searchError,
    fetchGeometry,
    refreshCourseData,
    submitHoleCorrection,
  }
}
