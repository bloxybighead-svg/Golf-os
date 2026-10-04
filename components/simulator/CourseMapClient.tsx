"use client"

import type { PlannerProps as Props } from "@/lib/planner/types"
import { usePlannerController } from "@/hooks/usePlannerController"
import { PlannerView } from "@/components/planner/PlannerView"

export function CourseMapClient({ calibrated, calibratedName, myProfile = null, trackedHandicap, baseline }: Props) {
  const vm = usePlannerController({ calibrated, calibratedName, myProfile, trackedHandicap, baseline })
  return <PlannerView vm={vm} calibrated={calibrated} calibratedName={calibratedName} myProfile={myProfile} trackedHandicap={trackedHandicap} />
}
