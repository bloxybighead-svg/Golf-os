import { loadCalibratedShots } from "@/lib/supabase/loadCalibratedShots"
import { createClient } from "@/lib/supabase/server"
import { CourseMapClient } from "@/components/simulator/CourseMapClient"
import { cleanCarries, cleanHandicap, type Baseline, type CourseRef } from "@/lib/golfer/baseline"

const GOLFER_NAME = "Dillon Cady"
const SOURCE_LABEL = "calibrated"

export default async function CoursePage() {
  const supabase = createClient()
  // If the stored profile can't be loaded, the page still works with the
  // handicap-based golfer generated in the browser. The signed-in golfer's
  // tracked handicap feeds the tee recommendation, and their setup numbers
  // (golfer_baseline) seed Play the first time it opens on a device. Signed
  // out, both queries simply return nothing (RLS).
  const [calibrated, { data: latestHandicap }, { data: baselineRow }] = await Promise.all([
    loadCalibratedShots(GOLFER_NAME, SOURCE_LABEL),
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("golfer_baseline").select("handicap_index, carries, home_course").maybeSingle(),
  ])

  const baseline: Baseline | null = baselineRow
    ? {
        handicapIndex: cleanHandicap(baselineRow.handicap_index),
        carries: cleanCarries((baselineRow.carries ?? {}) as Record<string, unknown>),
        homeCourse: (baselineRow.home_course ?? null) as CourseRef | null,
      }
    : null

  return (
    <CourseMapClient
      calibrated={calibrated}
      calibratedName={GOLFER_NAME}
      trackedHandicap={latestHandicap ? Number(latestHandicap.handicap_index) : null}
      baseline={baseline}
    />
  )
}
