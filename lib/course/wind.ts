// Wind for the planner: the current reading from Open-Meteo (free, no key), a
// manual override the golfer sets, and which of the two the planner uses.
// Manual always wins. Pure logic: fetching and storage are in hooks/useWind.ts.

import type { Wind } from "./playsLike"

/** A wind reading and when it was taken (ms since 1970). */
export interface WindReading extends Wind {
  at: number
}

/** The golfer's own setting. Direction is stored as a compass bearing the wind blows FROM, so it stays right when the hole changes. */
export interface ManualWind extends Wind {
  at: number
}

/** How often the reading is refreshed during a round. The spec's ~15 minutes; Open-Meteo itself updates every 15. */
export const WIND_REFRESH_MS = 15 * 60_000

/** A reading older than this is not used at all (a day-old wind says nothing about now). ESTIMATE: longer than a round, so a round played with no signal keeps its last reading. */
export const WIND_MAX_AGE_MS = 12 * 3_600_000

/** A manual setting lapses after this long, so yesterday's slider never silently steers today's round. ESTIMATE: about one round plus the walk to the car. */
export const MANUAL_WIND_MAX_AGE_MS = 6 * 3_600_000

/** A reading older than this is labelled with its time even when the phone has signal (a missed refresh). ESTIMATE: two refresh periods. */
export const WIND_STALE_MS = 2 * WIND_REFRESH_MS

/** The slider's range, mph (spec: 0 to 30). */
export const WIND_MIN_MPH = 0
export const WIND_MAX_MPH = 30

/** Readings and settings are rounded so a tiny change never re-ranks the whole bag: whole mph, compass in 5 degree steps. */
export function roundWind(w: Wind): Wind {
  return { speedMph: Math.round(w.speedMph), fromDeg: ((Math.round(w.fromDeg / 5) * 5) % 360 + 360) % 360 }
}

export function clampSpeed(mph: number): number {
  if (!Number.isFinite(mph)) return 0
  return Math.min(WIND_MAX_MPH, Math.max(WIND_MIN_MPH, Math.round(mph)))
}

/** Open-Meteo's forecast API, asking for the current 10 m wind in mph. */
export function windUrl(lat: number, lng: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: "wind_speed_10m,wind_direction_10m",
    wind_speed_unit: "mph",
  })
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`
}

/** The reading in an Open-Meteo response, or null when it isn't there or isn't numbers. */
export function parseWindResponse(json: unknown, now: number): WindReading | null {
  const cur = (json as { current?: { wind_speed_10m?: unknown; wind_direction_10m?: unknown } } | null)?.current
  const speed = cur?.wind_speed_10m
  const dir = cur?.wind_direction_10m
  if (typeof speed !== "number" || typeof dir !== "number" || !Number.isFinite(speed) || !Number.isFinite(dir)) return null
  const w = roundWind({ speedMph: Math.min(speed, 99), fromDeg: dir })
  return { ...w, at: now }
}

export type WindSource = "manual" | "auto" | "none"

export interface ResolvedWind {
  wind: Wind | null
  source: WindSource
  /** When the reading or setting was made. */
  at: number | null
  /** The reading is old enough, or the last refresh failed, that its time should be shown. */
  labelTime: boolean
}

/**
 * The wind the planner uses: the manual setting if there is a fresh one, else
 * the last automatic reading if it is not too old (offline, that is the last
 * one saved, labelled with its time), else none.
 */
export function resolveWind(manual: ManualWind | null, auto: WindReading | null, now: number, refreshFailed: boolean): ResolvedWind {
  if (manual && now - manual.at <= MANUAL_WIND_MAX_AGE_MS) {
    return { wind: { speedMph: manual.speedMph, fromDeg: manual.fromDeg }, source: "manual", at: manual.at, labelTime: false }
  }
  if (auto && now - auto.at <= WIND_MAX_AGE_MS) {
    return {
      wind: { speedMph: auto.speedMph, fromDeg: auto.fromDeg },
      source: "auto",
      at: auto.at,
      labelTime: refreshFailed || now - auto.at > WIND_STALE_MS,
    }
  }
  return { wind: null, source: "none", at: null, labelTime: false }
}

/** "2:14 pm" in the device's own clock. */
export function timeLabel(ms: number, locale?: string): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }).replace(/ /g, " ").toLowerCase()
}

/** The wind's direction relative to the hole, 0 = straight into the golfer's face along the hole, 90 = from the right, 180 = from behind, 270 = from the left. */
export function relativeToHole(fromDeg: number, holeBearingDeg: number): number {
  return (((fromDeg - holeBearingDeg) % 360) + 360) % 360
}

/** The compass bearing for a wind set relative to the hole (the inverse of relativeToHole). */
export function absoluteFromHole(relDeg: number, holeBearingDeg: number): number {
  return (((relDeg + holeBearingDeg) % 360) + 360) % 360
}

/** Short words for the card: "12 mph, into you", "8 mph, behind", "10 mph, from the left". */
export function describeWind(w: Wind, holeBearingDeg: number | null): string {
  if (w.speedMph <= 0) return "Calm"
  if (holeBearingDeg == null) return `${w.speedMph} mph`
  const rel = relativeToHole(w.fromDeg, holeBearingDeg)
  const dir =
    rel < 22.5 || rel >= 337.5 ? "into you" : rel < 67.5 ? "into, from the right" : rel < 112.5 ? "from the right" : rel < 157.5 ? "behind, from the right" : rel < 202.5 ? "behind" : rel < 247.5 ? "behind, from the left" : rel < 292.5 ? "from the left" : "into, from the left"
  return `${w.speedMph} mph, ${dir}`
}
