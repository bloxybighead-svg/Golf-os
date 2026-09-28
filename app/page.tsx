import { loadCalibratedShots } from "@/lib/supabase/loadCalibratedShots"
import { CourseMapClient } from "@/components/simulator/CourseMapClient"

const GOLFER_NAME = "Dillon Cady"
const SOURCE_LABEL = "calibrated"

export default async function CoursePage() {
  // If the stored profile can't be loaded, the page still works with the
  // handicap-based golfer generated in the browser.
  const calibrated = await loadCalibratedShots(GOLFER_NAME, SOURCE_LABEL)
  return <CourseMapClient calibrated={calibrated} calibratedName={GOLFER_NAME} />
}
