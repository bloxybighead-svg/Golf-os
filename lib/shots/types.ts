// Shapes shared by the shot-data import, storage and fitting code.

import type { Club } from "@/lib/golfer/tables"

export type Environment = "indoor" | "outdoor"
export type Surface = "mat" | "grass"

/** One practice session of shots (a range visit, a launch-monitor upload). */
export interface SessionMeta {
  id: string
  label: string
  /** YYYY-MM-DD; null when unknown (counts as today for recency). */
  date: string | null
  environment: Environment
  surface: Surface
  /** A golfer-excluded session never reaches the fit. */
  excluded: boolean
}

export type NewSession = Omit<SessionMeta, "id" | "excluded">

/** A shot as read from a file or typed in. Positive offline / curve / launch direction = right of target. */
export interface ParsedShot {
  club: Club
  carryYds: number
  offlineYds: number
  /** Launch monitors only. */
  curveYds: number | null
  launchDirDeg: number | null
  isPartial: boolean
}

/** A saved shot. `sessionId` is null for legacy rows that predate sessions. */
export interface StoredShot extends ParsedShot {
  sessionId: string | null
  date?: string | null
}
