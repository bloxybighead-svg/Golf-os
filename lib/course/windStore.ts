// What the wind feature keeps on the device: the last automatic reading per
// course (so a round with no signal still has one, labelled with its time), the
// golfer's manual setting, and the plays-like on/off switch. localStorage, every
// call safe where it is blocked.

import { WIND_MAX_AGE_MS, type ManualWind, type WindReading } from "./wind"

export const WIND_AUTO_KEY = "golfos.windAuto.v1"
export const WIND_MANUAL_KEY = "golfos.windManual.v1"
export const PLAYS_LIKE_KEY = "golfos.playsLike.v1"
/** Fired on window when plays-like is switched in this tab. */
export const PLAYS_LIKE_EVENT = "golfos:plays-like"

/** Courses whose last reading is kept. ESTIMATE: a few home courses. */
const MAX_COURSES = 8

type AutoMap = Record<string, WindReading>

function isReading(v: unknown): v is WindReading {
  const r = v as WindReading | null
  return !!r && Number.isFinite(r.speedMph) && Number.isFinite(r.fromDeg) && Number.isFinite(r.at)
}

/** Parses the saved map, dropping anything malformed or older than WIND_MAX_AGE_MS. */
export function parseAutoMap(raw: string | null, now: number): AutoMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: AutoMap = {}
    for (const [k, v] of Object.entries(parsed)) if (isReading(v) && now - v.at <= WIND_MAX_AGE_MS) out[k] = v
    return out
  } catch {
    return {}
  }
}

export function readAutoWind(courseId: string, now = Date.now()): WindReading | null {
  try {
    return parseAutoMap(localStorage.getItem(WIND_AUTO_KEY), now)[courseId] ?? null
  } catch {
    return null
  }
}

export function saveAutoWind(courseId: string, reading: WindReading): void {
  try {
    const map = parseAutoMap(localStorage.getItem(WIND_AUTO_KEY), reading.at)
    map[courseId] = reading
    const keep = Object.entries(map).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_COURSES)
    localStorage.setItem(WIND_AUTO_KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch {
    /* the reading just won't be there offline */
  }
}

export function readManualWind(): ManualWind | null {
  try {
    const raw = localStorage.getItem(WIND_MANUAL_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return isReading(v) ? v : null
  } catch {
    return null
  }
}

export function saveManualWind(w: ManualWind | null): void {
  try {
    if (w) localStorage.setItem(WIND_MANUAL_KEY, JSON.stringify(w))
    else localStorage.removeItem(WIND_MANUAL_KEY)
  } catch {
    /* the choice just won't stick */
  }
}

/** Plays-like is on unless the golfer switched it off. */
export function readPlaysLikeOn(): boolean {
  try {
    return localStorage.getItem(PLAYS_LIKE_KEY) !== "0"
  } catch {
    return true
  }
}

export function savePlaysLikeOn(on: boolean): void {
  try {
    localStorage.setItem(PLAYS_LIKE_KEY, on ? "1" : "0")
  } catch {
    /* the choice just won't stick */
  }
  try {
    window.dispatchEvent(new Event(PLAYS_LIKE_EVENT))
  } catch {
    /* no window (tests) */
  }
}
