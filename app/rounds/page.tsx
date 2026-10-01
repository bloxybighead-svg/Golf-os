import { createClient } from "@/lib/supabase/server"
import { RoundsClient } from "@/components/rounds/RoundsClient"
import { RoundsSummary } from "@/components/rounds/RoundsSummary"
import type { Round } from "@/lib/supabase/types"

export default async function RoundsPage({
  searchParams,
}: {
  searchParams?: { new?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) {
    return (
      <div className="rounded-xl border border-warn/40 bg-warn/10 px-5 py-4 text-sm text-warn">
        <p className="font-semibold">Supabase not connected</p>
        <p className="mt-1 text-xs text-warn">
          Run supabase/rounds_schema.sql and check your .env.local keys.
        </p>
      </div>
    )
  }

  const rounds = (data ?? []) as Round[]

  // Casual (non-competitive) GIR baseline — used to flag competitive pressure-collapse rounds
  const casualGir = rounds.filter((r) => !r.is_competitive && r.gir_pct != null).map((r) => r.gir_pct as number)
  const casualGirAvg = casualGir.length ? casualGir.reduce((a, b) => a + b, 0) / casualGir.length : null

  return (
    <RoundsClient
      rounds={rounds}
      casualGirAvg={casualGirAvg}
      summary={<RoundsSummary rounds={rounds} />}
      initialAdding={searchParams?.new === "1"}
      signedIn={!!user}
    />
  )
}
