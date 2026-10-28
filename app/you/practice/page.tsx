import { createClient } from "@/lib/supabase/server"
import { loadSgData } from "@/lib/supabase/loadSgData"
import { loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { loadPracticeData } from "@/lib/supabase/loadPracticeData"
import { PracticePlan } from "@/components/practice/PracticePlan"
import { LogPracticeSheet } from "@/components/you/LogPracticeSheet"
import { DrillHistory } from "@/components/you/DrillHistory"
import type { HandicapEntry } from "@/lib/supabase/types"

/** The same window Stats uses. */
const SG_WINDOW_ROUNDS = 10

export default async function PracticePage() {
  const supabase = await createClient()

  const [
    { data: { user } },
    { data: latestHandicap },
    sgData,
    profile,
    practice,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
    loadSgData(supabase, SG_WINDOW_ROUNDS),
    loadMyProfile(supabase),
    loadPracticeData(supabase),
  ])

  const handicapIndex = (latestHandicap as Pick<HandicapEntry, "handicap_index"> | null)?.handicap_index ?? null
  const activeLibrary = practice.library.filter((d) => d.status === "active")

  return (
    <div className="space-y-6 pt-4">
      <h2 className="text-2xl font-semibold tracking-tight text-fg">Practice</h2>

      <PracticePlan
        sgData={sgData}
        fits={profile?.fits ?? null}
        handicapIndex={handicapIndex}
        savedRuns={practice.runs}
        library={practice.library}
        activeLibrary={activeLibrary}
        levels={practice.levels}
        levelSince={practice.levelSince}
        userId={user?.id ?? null}
      />

      <LogPracticeSheet library={activeLibrary} userId={user?.id ?? null} />

      <DrillHistory runs={practice.runs} library={practice.library} />
    </div>
  )
}
