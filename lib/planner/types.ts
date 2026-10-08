// Types shared by the Play planner's page, controller and view (moved verbatim from CourseMapClient.tsx).

import type { Baseline } from "@/lib/golfer/baseline"
import type { ClubFit } from "@/lib/golfer/shotProfile"

/**
 * Whose shots the planner uses. "calibrated" is the golfer's own measured shots (their fitted
 * profile): the same token the account sync (golfer_baseline.source) already stores, so it
 * needs no schema change. "legacy" is the old public Dillon data, offered only with ?legacy=1
 * and never synced. "handicap" is a handicap estimate.
 */
export type ShotSource = "calibrated" | "handicap" | "legacy"

/** The signed-in golfer's fitted profile (shot_profiles) and how many sessions back it. */
export interface MyProfile {
  fits: ClubFit[]
  sessionCount: number
  /** Latest fit time: changes whenever the profile is re-fitted. */
  version: string
  /** The temperature the shots were measured at, degrees F: the shot-count-weighted average over the included sessions that have one, else 70. */
  baselineTemperatureF: number
}

export interface CalibratedClub {
  club: string
  meanCarryYds: number
  shots: { carryYds: number; offlineYds: number }[]
}

export interface PlannerProps {
  calibrated: CalibratedClub[] | null
  calibratedName: string
  /** The golfer's own calibrated profile, when they have uploaded shot data. */
  myProfile?: MyProfile | null
  /** The signed-in golfer's latest tracked handicap, for the tee recommendation. */
  trackedHandicap: number | null
  /** The signed-in golfer's setup numbers, applied the first time Play opens on a device. */
  baseline: Baseline | null
}
