import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { loadCategoryTrends } from "@/lib/supabase/loadCategoryTrends"
import { AccountCard } from "@/components/auth/AccountCard"
import { TrendsPanel } from "@/components/you/TrendsPanel"
import { RecommendedDrills } from "@/components/you/RecommendedDrills"
import { DrillHistory } from "@/components/you/DrillHistory"
import { AppearanceSetting } from "@/components/you/AppearanceSetting"
import type { HandicapEntry, LibraryDrill, Milestone, Round, UserDrillRun } from "@/lib/supabase/types"
import { weakestCategory, recommendDrills } from "@/lib/drillRecommendations"
import { Activity, ChevronRight, Flag, GitCompare, SlidersHorizontal, type LucideIcon } from "lucide-react"

// The bag tools that used to be Course Planner sub-tabs, one row each.
const BAG_TOOLS: { view: string; label: string; blurb: string; Icon: LucideIcon }[] = [
  { view: "dispersion", label: "Dispersion", blurb: "Your simulated shot pattern, club by club", Icon: Activity },
  { view: "compare", label: "Compare golfers", blurb: "Overlay two golfers' dispersion and real shots", Icon: GitCompare },
  { view: "custom", label: "Custom golfer", blurb: "Build a what-if golfer from a handicap and carries", Icon: SlidersHorizontal },
  { view: "tbox", label: "Tee box", blurb: "Which tees fit your handicap and driver distance", Icon: Flag },
]

export default async function YouPage() {
  const supabase = createClient()

  const [
    { data: { user } },
    { data: handicapData },
    { data: roundsData },
    { data: milestonesData },
    { data: libraryData },
    { data: drillRunsData },
    categoryTrends,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("handicap_tracking").select("*").order("calculation_date", { ascending: true }),
    supabase.from("rounds").select("*").order("date", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("milestones").select("*").order("date", { ascending: true }),
    supabase.from("drill_library").select("*"),
    supabase
      .from("user_drills")
      .select("id, drill_id, started_at, completed_at, reps_completed, notes, drill_library(name, category)")
      .order("started_at", { ascending: false })
      .limit(50),
    loadCategoryTrends(supabase),
  ])

  const handicapEntries = (handicapData ?? []) as HandicapEntry[] // oldest first
  const latestHandicap = handicapEntries[handicapEntries.length - 1] ?? null

  // Drill recommendations target the weakest category on the Play page's Strengths & Weaknesses card.
  const drillRuns = (drillRunsData ?? []) as unknown as UserDrillRun[]
  const focusArea = weakestCategory(categoryTrends)
  const recommended = focusArea
    ? recommendDrills((libraryData ?? []) as LibraryDrill[], focusArea.category, drillRuns)
    : []

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-fg">You</h2>
        <p className="mt-1 text-sm text-muted">Your account, your bag and what to practice next</p>
      </div>

      <AccountCard email={user?.email ?? null} />

      <TrendsPanel
        rounds={(roundsData ?? []) as Round[]}
        handicapEntries={handicapEntries}
        milestones={(milestonesData ?? []) as Milestone[]}
      />

      <RecommendedDrills
        focus={focusArea}
        handicapIndex={latestHandicap?.handicap_index ?? null}
        drills={recommended}
        signedIn={!!user}
      />

      <DrillHistory runs={drillRuns} />

      <div className="rounded-xl border border-fg/[0.06] bg-surface shadow-sm">
        <p className="label-xs px-5 pt-4">Your Bag</p>
        <ul className="mt-2 divide-y divide-fg/[0.04]">
          {BAG_TOOLS.map(({ view, label, blurb, Icon }) => (
            <li key={view}>
              <Link
                href={`/you/bag?view=${view}`}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-fg/[0.03]"
              >
                <Icon size={16} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{label}</span>
                  <span className="block text-xs text-muted">{blurb}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <AppearanceSetting />
    </div>
  )
}
