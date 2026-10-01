// Everything the Play planner keeps in this device's localStorage: key names
// and load/save helpers (moved verbatim from CourseMapClient.tsx -- the key
// strings must never change, or saved data stops being found).

import type { UserZone } from "@/lib/course/lies"
import type { ConfirmableHazard } from "@/lib/course/dataQuality"
import { LAST_POSITION_KEY } from "@/lib/golfer/baseline"
import { DRAW_KINDS } from "./labels"

export interface CourseHit {
  id: string
  name: string
  city: string | null
  state: string | null
  par: number | null
  lat: number | null
  lng: number | null
}

// A first visit opens straight onto a real, well-mapped hole with the ball on the
// tee, so the recommendation is the first thing anyone sees -- no instructions.
export const DEFAULT_COURSE: CourseHit = {
  id: "40977ee8-33ee-4195-b6a2-99a4ca83c2bc",
  name: "Pebble Beach Golf Links",
  city: "Pebble Beach",
  state: "CA",
  par: 72,
  lat: 36.5685,
  lng: -121.949,
}
export const DEFAULT_HOLE_REF = 7
export const RECENT_KEY = "golfos.recentCourses.v1"
export const COURSE_CACHE_MAX_AGE_MS = 30 * 24 * 3600 * 1000

function zonesKey(courseId: string): string {
  return `golfos.zones.${courseId}.v1`
}

function zoomKey(courseId: string): string {
  return `golfos.zoom.${courseId}.v1`
}

/** Remembered zoom for a course, used only as the INITIAL view when it loads -- picking a
 * hole still fits that hole's own bounds, which is a smarter default than a stale number
 * from a differently-shaped hole. */
export function loadZoom(courseId: string): number | undefined {
  try {
    const v = Number(localStorage.getItem(zoomKey(courseId)))
    return Number.isFinite(v) && v >= 10 && v <= 21 ? v : undefined
  } catch {
    return undefined
  }
}

export function saveZoom(courseId: string, zoom: number) {
  try {
    localStorage.setItem(zoomKey(courseId), String(zoom))
  } catch {
    /* storage full or blocked: it just won't be remembered next time */
  }
}

export type NoHazardMap = Record<string, Partial<Record<ConfirmableHazard, boolean>>> // holeId -> which hazards are confirmed absent

function noHazardKey(courseId: string): string {
  return `golfos.noHazard.${courseId}.v1`
}

/** Which hazards the golfer has confirmed don't exist on which holes, saved on this device. */
export function loadNoHazard(courseId: string): NoHazardMap {
  try {
    const raw = localStorage.getItem(noHazardKey(courseId))
    if (!raw) return {}
    const v = JSON.parse(raw)
    return v && typeof v === "object" ? v : {}
  } catch {
    return {}
  }
}

export function saveNoHazard(courseId: string, map: NoHazardMap) {
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
export function loadLastPosition(): LastPosition | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_POSITION_KEY) ?? "null")
    return v && v.course && typeof v.course.id === "string" && typeof v.course.name === "string" ? v : null
  } catch {
    return null
  }
}

export function saveLastPosition(pos: LastPosition) {
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
export function updateLastPositionHole(holeId: string) {
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
export function loadZones(courseId: string): UserZone[] {
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

export function saveZones(courseId: string, zones: UserZone[]) {
  try {
    localStorage.setItem(zonesKey(courseId), JSON.stringify(zones))
  } catch {
    /* storage full or blocked: the marks just won't be remembered */
  }
}
