import { createClient } from "@/lib/supabase/server"
import { loadSgData } from "@/lib/supabase/loadSgData"
import { loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { RecommendedDrills } from "@/components/you/RecommendedDrills"
import { LogPracticeSheet } from "@/components/you/LogPracticeSheet"
import { DrillHistory } from "@/components/you/DrillHistory"
import { SubPageHeader } from "@/components/you/SubPageHeader"
import type { HandicapEntry, LibraryDrill, UserDrillRun } from "@/lib/supabase/types"
import type { SgCategory } from "@/lib/sgBenchmarks"
import { DRILL_CATEGORIES, recommendDrills } from "@/lib/drillRecommendations"

/** The same window Stats uses. */
const SG_WINDOW_ROUNDS = 10

export default async function PracticePage() {
  const supabase = await createClient()

  const [
    { data: { user } },
    { data: latestHandicap },
    { data: libraryData },
    { data: drillRunsData },
    sgData,
    profile,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("drill_library").select("*").eq("status", "active"),
    supabase
      .from("user_drills")
      .select("id, drill_id, started_at, completed_at, reps_completed, minutes, rating, notes, drill_library(name, category)")
      .order("started_at", { ascending: false })
      .limit(50),
    loadSgData(supabase, SG_WINDOW_ROUNDS),
    loadMyProfile(supabase),
  ])

  // Drills follow the weakest category of the strokes gained on Stats (worked out in the browser, where the comparison level is).
  const handicapIndex = (latestHandicap as Pick<HandicapEntry, "handicap_index"> | null)?.handicap_index ?? null
  const drillRuns = (drillRunsData ?? []) as unknown as UserDrillRun[]
  const library = (libraryData ?? []) as LibraryDrill[]
  const drillsByCategory = Object.fromEntries(
    DRILL_CATEGORIES.map((c) => [c, recommendDrills(library, c, drillRuns)])
  ) as Record<SgCategory, LibraryDrill[]>

  return (
    <div className="space-y-6 pt-4">
      <SubPageHeader title="Practice" />

      <RecommendedDrills
        sgData={sgData}
        fits={profile?.fits ?? null}
        handicapIndex={handicapIndex}
        drillsByCategory={drillsByCategory}
        signedIn={!!user}
      />

      <DrillHistory runs={drillRuns} />

      <LogPracticeSheet library={library} signedIn={!!user} />
    </div>
  )
}
