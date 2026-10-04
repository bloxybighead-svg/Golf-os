// Types shared by the Play planner's page, controller and view (moved verbatim from CourseMapClient.tsx).

import type { Baseline } from "@/lib/golfer/baseline"
import type { ClubFit } from "@/lib/golfer/shotProfile"

/** Whose shots the planner uses: the golfer's own fitted profile, the old public Dillon data, or a handicap estimate. */
export type ShotSource = "mine" | "calibrated" | "handicap"

/** The signed-in golfer's fitted profile (shot_profiles) and how many sessions back it. */
export interface MyProfile {
  fits: ClubFit[]
  sessionCount: number
  /** Latest fit time: changes whenever the profile is re-fitted. */
  version: string
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
