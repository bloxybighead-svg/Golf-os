import { loadCalibratedShots, LEGACY_GOLFER_NAME, LEGACY_SOURCE_LABEL } from "@/lib/supabase/loadCalibratedShots"
import { loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { createClient } from "@/lib/supabase/server"
import { CourseMapClient } from "@/components/simulator/CourseMapClient"
import { cleanCarries, cleanHandicap, type Baseline, type CourseRef } from "@/lib/golfer/baseline"

// ?legacy=1 loads the old public calibrated profile next to the golfer's own, to compare the two
// until the old data is removed (supabase/shot_data_13c_lockdown.sql). Without it the page never names a golfer.
export default async function CoursePage({ searchParams }: { searchParams?: { legacy?: string } }) {
  const supabase = createClient()
  // If the stored profile can't be loaded, the page still works with the
  // handicap-based golfer generated in the browser. The signed-in golfer's
  // tracked handicap feeds the tee recommendation, and their setup numbers
  // (golfer_baseline) seed Play the first time it opens on a device. Signed
  // out, both queries simply return nothing (RLS).
  const [calibrated, myProfile, { data: latestHandicap }, { data: baselineRow }] = await Promise.all([
    searchParams?.legacy === "1" ? loadCalibratedShots(LEGACY_GOLFER_NAME, LEGACY_SOURCE_LABEL) : Promise.resolve(null),
    loadMyProfile(supabase),
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
      calibratedName={LEGACY_GOLFER_NAME}
      myProfile={myProfile}
      trackedHandicap={latestHandicap ? Number(latestHandicap.handicap_index) : null}
      baseline={baseline}
    />
  )
}
