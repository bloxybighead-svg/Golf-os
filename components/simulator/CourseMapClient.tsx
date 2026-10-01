"use client"

import type { PlannerProps as Props } from "@/lib/planner/types"
import { usePlannerController } from "@/hooks/usePlannerController"
import { PlannerView } from "@/components/planner/PlannerView"

export function CourseMapClient({ calibrated, calibratedName, trackedHandicap, baseline }: Props) {
  const vm = usePlannerController({ calibrated, calibratedName, trackedHandicap, baseline })
  return <PlannerView vm={vm} calibrated={calibrated} calibratedName={calibratedName} trackedHandicap={trackedHandicap} />
}
