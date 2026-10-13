import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { cleanHandicap, type CourseRef } from "@/lib/golfer/baseline"
import { MyBag } from "@/components/you/MyBag"
import { SubPageHeader } from "@/components/you/SubPageHeader"

export default async function BagPage(props: { searchParams?: Promise<{ view?: string }> }) {
  // Old ?view= links land on the bag itself.
  if ((await props.searchParams)?.view) redirect("/you/bag")

  const supabase = await createClient()
  const [profile, { data: baseline }, { data: tracked }] = await Promise.all([
    loadMyProfile(supabase),
    supabase.from("golfer_baseline").select("home_course, handicap_index").maybeSingle(),
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
  ])
  // The same order Play blends thin clubs toward: tracked index, else the setup one.
  const accountHandicap = tracked ? Number(tracked.handicap_index) : cleanHandicap(baseline?.handicap_index)

  return (
    <div className="space-y-5 pt-4">
      <SubPageHeader title="My bag" />
      <MyBag
        fits={profile?.fits ?? null}
        accountHandicap={accountHandicap}
        serverHomeCourse={(baseline?.home_course ?? null) as CourseRef | null}
      />
    </div>
  )
}
