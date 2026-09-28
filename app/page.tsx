import { loadCalibratedShots } from "@/lib/supabase/loadCalibratedShots"
import { createClient } from "@/lib/supabase/server"
import { CourseMapClient } from "@/components/simulator/CourseMapClient"

const GOLFER_NAME = "Dillon Cady"
const SOURCE_LABEL = "calibrated"

export default async function CoursePage() {
  // If the stored profile can't be loaded, the page still works with the
  // handicap-based golfer generated in the browser. The tracked handicap (the
  // signed-in golfer's latest; none when signed out) feeds the tee recommendation.
  const [calibrated, { data: latestHandicap }] = await Promise.all([
    loadCalibratedShots(GOLFER_NAME, SOURCE_LABEL),
    createClient()
      .from("handicap_tracking")
      .select("handicap_index")
      .order("calculation_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return (
    <CourseMapClient
      calibrated={calibrated}
      calibratedName={GOLFER_NAME}
      trackedHandicap={latestHandicap ? Number(latestHandicap.handicap_index) : null}
    />
  )
}
