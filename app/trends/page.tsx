import { createClient } from "@/lib/supabase/server"
import { TrendsClient } from "@/components/trends/TrendsClient"
import { SignedOutNotice } from "@/components/auth/SignedOutNotice"
import type { Round, Milestone, PracticeSession } from "@/lib/supabase/types"

export default async function TrendsPage() {
  const supabase = createClient()

  const [{ data: { user } }, { data: rounds, error: roundsError }, { data: sessions }, { data: milestones }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("rounds").select("*").order("date", { ascending: true }),
    supabase.from("practice_sessions").select("*").order("date", { ascending: true }),
    supabase.from("milestones").select("*").order("date", { ascending: true }),
  ])

  if (roundsError) {
    return (
      <div className="rounded-xl border border-yellow-800/60 bg-yellow-950/30 px-5 py-4 text-sm text-yellow-400">
        <p className="font-semibold">Supabase not connected</p>
        <p className="mt-1 text-xs text-yellow-600">
          Run the schema SQL and check your .env.local keys.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {!user && <SignedOutNotice feature="trends" />}
      <TrendsClient
        rounds={(rounds ?? []) as Round[]}
        sessions={(sessions ?? []) as PracticeSession[]}
        milestones={(milestones ?? []) as Milestone[]}
      />
    </div>
  )
}
