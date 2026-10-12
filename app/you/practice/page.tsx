import { createClient } from "@/lib/supabase/server"
import { loadCategoryTrends } from "@/lib/supabase/loadCategoryTrends"
import { loadShotSg } from "@/lib/supabase/loadShotSg"
import { RecommendedDrills } from "@/components/you/RecommendedDrills"
import { LogPracticeSheet } from "@/components/you/LogPracticeSheet"
import { DrillHistory } from "@/components/you/DrillHistory"
import { SubPageHeader } from "@/components/you/SubPageHeader"
import type { HandicapEntry, LibraryDrill, UserDrillRun } from "@/lib/supabase/types"
import type { SgCategory } from "@/lib/sgBenchmarks"
import { DRILL_CATEGORIES, drillTrends, focusAreas, recommendDrills } from "@/lib/drillRecommendations"

export default async function PracticePage() {
  const supabase = await createClient()

  const [
    { data: { user } },
    { data: latestHandicap },
    { data: libraryData },
    { data: drillRunsData },
    categoryTrends,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("drill_library").select("*"),
    supabase
      .from("user_drills")
      .select("id, drill_id, started_at, completed_at, reps_completed, minutes, rating, notes, drill_library(name, category)")
      .order("started_at", { ascending: false })
      .limit(50),
    loadCategoryTrends(supabase),
  ])

  // Drills follow the weakest category on the Strengths & Weaknesses card (strokes gained from
  // recorded shots when there are some).
  const handicapIndex = (latestHandicap as Pick<HandicapEntry, "handicap_index"> | null)?.handicap_index ?? null
  const shotSg = await loadShotSg(supabase, handicapIndex)
  const trends = drillTrends(shotSg?.mine?.summary ?? null, categoryTrends)
  const drillRuns = (drillRunsData ?? []) as unknown as UserDrillRun[]
  const focus = focusAreas(trends)
  const library = (libraryData ?? []) as LibraryDrill[]
  const drillsByCategory = Object.fromEntries(
    DRILL_CATEGORIES.map((c) => [c, recommendDrills(library, c, drillRuns)])
  ) as Record<SgCategory, LibraryDrill[]>

  return (
    <div className="space-y-6 pt-4">
      <SubPageHeader title="Practice" />

      <RecommendedDrills
        focus={focus}
        handicapIndex={handicapIndex}
        drillsByCategory={drillsByCategory}
        signedIn={!!user}
      />

      <DrillHistory runs={drillRuns} />

      <LogPracticeSheet library={library} signedIn={!!user} />
    </div>
  )
}
