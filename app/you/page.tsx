import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { estimateHandicapIndex } from "@/lib/handicap"
import { normalizeBag } from "@/lib/golfer/bag"
import { drillsThisWeek, practiceValue, statsValue, PRACTICE_WINDOW_DAYS } from "@/lib/you/hub"
import { loginHref } from "@/lib/auth/safeNext"
import { HubRow } from "@/components/you/HubRow"
import { BagCount, ThemeLabel } from "@/components/you/DeviceValues"

const DAY_MS = 24 * 60 * 60 * 1000

// A short hub: four rows, each with the one number worth seeing without opening it.
// The detail lives on /you/stats, /you/practice, /you/bag and /you/settings.
export default async function YouPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const since = new Date(Date.now() - PRACTICE_WINDOW_DAYS * DAY_MS).toISOString()

  const [{ data: latest }, { data: diffRows }, { data: drillRows }, { data: profileRows }] = await Promise.all([
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("rounds").select("differential").order("date", { ascending: false }).order("created_at", { ascending: false }).limit(20),
    supabase.from("user_drills").select("completed_at").gte("completed_at", since),
    supabase.from("shot_profiles").select("club"), // the golfer's own fitted clubs (RLS: own rows only)
  ])

  // Same rule as the Stats page: the saved index if there is one, else the live estimate.
  const index =
    latest?.handicap_index != null
      ? Number(latest.handicap_index)
      : estimateHandicapIndex((diffRows ?? []).map((r) => r.differential).filter((d): d is number => d != null))
  const fittedClubs = normalizeBag((profileRows ?? []).map((r) => r.club as string))

  return (
    <div className="space-y-6 pt-4">
      <h2 className="text-2xl font-bold tracking-tight text-fg">You</h2>

      {!user && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-fg/[0.08] bg-surface px-4 py-3">
          <p className="text-sm text-fg">Sign in to save rounds, your bag and your stats across devices.</p>
          <Link href={loginHref("/you")} className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110">
            Sign in
          </Link>
        </div>
      )}

      <nav aria-label="You" className="divide-y divide-fg/[0.04] overflow-hidden rounded-xl border border-fg/[0.06] bg-surface">
        <HubRow href="/you/stats" label="Stats" value={statsValue(index)} />
        <HubRow href="/you/practice" label="Practice" value={practiceValue(drillsThisWeek(drillRows ?? [], Date.now()))} />
        <HubRow
          href="/you/bag"
          label="My bag"
          value={<BagCount defaultSource={fittedClubs.length > 0 ? "calibrated" : "handicap"} fittedClubs={fittedClubs} />}
        />
        <HubRow href="/you/settings" label="Settings" value={<ThemeLabel />} />
      </nav>

      <Link href="/you/lab" className="flex min-h-[44px] w-fit items-center text-sm font-semibold text-accent hover:underline">
        Lab: compare, what if, which tees
      </Link>
    </div>
  )
}
