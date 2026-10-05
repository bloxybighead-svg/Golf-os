// Saved copies of what the planner needs once a round has started, so it keeps
// working with no signal: the course map (with corrections already applied), tees,
// and scorecard, kept in IndexedDB (lib/offline/db.ts).
//
// The golfer's own shot profile, setup and bag need no copy here: they arrive inside
// the Play page itself (server props), and the page is saved for offline use at Start
// round (warmPageCache), together with the settings localStorage already keeps.
//
// Hand-drawn zones and OB tags are not copied here: the planner already mirrors
// them in localStorage on every change and every load (hooks/useZones.ts,
// hooks/useObTags.ts), which is what it reads when the network fails.
//
// NOT saved, on purpose: map tiles. Esri's terms do not allow storing World
// Imagery for offline use, so with no signal the map shows the course shapes on
// a plain background (components/simulator/CourseMap.tsx).

import { clearOfflineStore, kvDelete, kvGet, kvKeys, kvSet } from "./db"
import type { CourseGeometry } from "@/lib/course/overpass"
import { PAGES_CACHE } from "./cacheNames"

export const snapshotKeys = {
  course: (id: string) => `course:${id}`,
  tees: (id: string) => `tees:${id}`,
  scorecard: (id: string) => `scorecard:${id}`,
}

/** Courses kept offline; the least recently saved goes first. An estimate: a few home courses plus ones played on trips. */
export const MAX_SAVED_COURSES = 8

/** Saves a course's map data, dropping the oldest saved course beyond MAX_SAVED_COURSES. */
export async function saveCourseGeometry(courseId: string, geometry: CourseGeometry): Promise<void> {
  if (!(await kvSet(snapshotKeys.course(courseId), geometry))) return
  const saved = (await kvKeys("course:")).sort((a, b) => b.savedAt - a.savedAt)
  for (const old of saved.slice(MAX_SAVED_COURSES)) await kvDelete(old.key)
}

export async function loadCourseGeometry(courseId: string): Promise<CourseGeometry | null> {
  const row = await kvGet<CourseGeometry>(snapshotKeys.course(courseId))
  return row && Array.isArray(row.value?.holes) && row.value.holes.length > 0 ? row.value : null
}

/**
 * GET a JSON endpoint; remember a good answer, and when the network (or the server)
 * fails give back the last good one. null when there is neither.
 */
export async function fetchWithSnapshot<T>(url: string, key: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init)
    if (res.ok) {
      const data = (await res.json()) as T
      void kvSet(key, data)
      return data
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e
  }
  return (await kvGet<T>(key))?.value ?? null
}

export interface PrefetchInput {
  courseId: string
  geometry: CourseGeometry | null
}

export interface PrefetchReport {
  saved: string[]
  failed: string[]
}

/**
 * "Start round": saves everything the planner needs for this course while there
 * is still signal. Each piece is independent; the report says which failed so the
 * golfer can be told (they can still play with whatever was saved before).
 */
export async function prefetchForRound(input: PrefetchInput): Promise<PrefetchReport> {
  const report: PrefetchReport = { saved: [], failed: [] }
  const note = (name: string, ok: boolean) => (ok ? report.saved : report.failed).push(name)

  if (input.geometry) {
    await saveCourseGeometry(input.courseId, input.geometry)
    note("course map", true)
  } else note("course map", false)

  const [tees, card] = await Promise.all([
    fetchWithSnapshot(`/api/courses/${encodeURIComponent(input.courseId)}/tees`, snapshotKeys.tees(input.courseId)),
    fetchWithSnapshot(`/api/courses/${encodeURIComponent(input.courseId)}/scorecard`, snapshotKeys.scorecard(input.courseId)),
  ])
  note("tees", tees !== null)
  note("scorecard", card !== null)

  // The Play page carries the golfer's shot profile, setup and bag.
  note("your shots and settings", await warmPageCache())
  return report
}

/**
 * Puts the current Play page (and the offline page) in the service worker's page
 * cache now. The worker only learns a page from a real navigation, and the golfer
 * may open it for the first time on this device just before the round.
 */
export async function warmPageCache(): Promise<boolean> {
  if (typeof caches === "undefined") return false
  const cache = await caches.open(PAGES_CACHE)
  try {
    const res = await fetch("/", { credentials: "same-origin", headers: { Accept: "text/html" } })
    if (res.ok) {
      await cache.put("/", res)
      return true
    }
  } catch {
    /* no signal: a copy saved earlier still counts */
  }
  return (await cache.match("/")) !== undefined
}

/** Sign-out: forget this golfer's saved copies and cached pages (which hold their data). Queued rounds stay: see clearOfflineStore. */
export async function forgetEverythingOffline(): Promise<void> {
  await clearOfflineStore()
  try {
    if (typeof caches !== "undefined") await caches.delete(PAGES_CACHE)
  } catch {
    /* nothing to do */
  }
}
