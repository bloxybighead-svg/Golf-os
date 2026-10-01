// Types shared by the Play planner's page, controller and view (moved verbatim from CourseMapClient.tsx).

import type { Baseline } from "@/lib/golfer/baseline"

export interface CalibratedClub {
  club: string
  meanCarryYds: number
  shots: { carryYds: number; offlineYds: number }[]
}

export interface PlannerProps {
  calibrated: CalibratedClub[] | null
  calibratedName: string
  /** The signed-in golfer's latest tracked handicap, for the tee recommendation. */
  trackedHandicap: number | null
  /** The signed-in golfer's setup numbers, applied the first time Play opens on a device. */
  baseline: Baseline | null
}
