// The temperature a golfer's carries were measured at: the baseline the planner
// adjusts the air temperature against (lib/course/playsLike.ts). Pure logic.

import { DEFAULT_BASELINE_TEMP_F } from "@/lib/course/playsLike"
import type { Environment, SessionMeta, StoredShot } from "./types"

/** Indoor sessions (a simulator bay or heated range) are taken to be this warm unless the golfer says otherwise. */
export const INDOOR_TEMP_F = 70

/** The temperature range a session can be saved with, degrees F (the shot_sessions.temperature_f check). */
export const SESSION_TEMP_MIN_F = -20
export const SESSION_TEMP_MAX_F = 120

/** A typed temperature as a saveable number, or null when it is blank or out of range. */
export function parseSessionTemperature(raw: string): number | null {
  if (raw.trim() === "") return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= SESSION_TEMP_MIN_F && n <= SESSION_TEMP_MAX_F ? Math.round(n * 10) / 10 : null
}

/** Indoor sessions with no temperature get INDOOR_TEMP_F; anything else is left as it is. */
export function withIndoorDefault<T extends { environment: Environment; temperatureF?: number | null }>(s: T): T {
  return s.environment === "indoor" && s.temperatureF == null ? { ...s, temperatureF: INDOOR_TEMP_F } : s
}

export interface TemperatureEntry {
  temperatureF: number | null | undefined
  shotCount: number
}

/**
 * The profile's baseline temperature: the average of the sessions that have a temperature, each weighted by its
 * shot count. 70 F (DEFAULT_BASELINE_TEMP_F) when none do. Pass only the sessions that are in the profile.
 */
export function baselineTemperatureF(entries: TemperatureEntry[]): number {
  let sum = 0
  let weight = 0
  for (const e of entries) {
    if (e.temperatureF == null || !Number.isFinite(e.temperatureF) || e.shotCount <= 0) continue
    sum += e.temperatureF * e.shotCount
    weight += e.shotCount
  }
  return weight > 0 ? sum / weight : DEFAULT_BASELINE_TEMP_F
}

/** The same, from the sessions and shots as the shot data page holds them: excluded sessions and partial swings are left out, as in the fit. */
export function baselineFromSessions(sessions: SessionMeta[], shots: StoredShot[]): number {
  const counts = new Map<string, number>()
  for (const s of shots) if (s.sessionId && !s.isPartial) counts.set(s.sessionId, (counts.get(s.sessionId) ?? 0) + 1)
  return baselineTemperatureF(sessions.filter((s) => !s.excluded).map((s) => ({ temperatureF: s.temperatureF, shotCount: counts.get(s.id) ?? 0 })))
}
