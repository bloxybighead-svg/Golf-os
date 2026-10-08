import { createClient } from "@/lib/supabase/server"
import { aggregateCategoryTrends, type CategoryTrend } from "@/lib/sgBenchmarks"
import type { RoundAnalysis } from "@/lib/supabase/types"

// "Last 10 rounds" -- more stable than a fixed date window across streaky logging habits.
const TRENDS_WINDOW_ROUNDS = 10

/**
 * Strengths & weaknesses: SG-proxy deltas averaged over the most recent rounds.
 * Shared by the Play page's TrendsCard and the You page's drill focus area, so
 * the two always agree on which category is weakest.
 */
export async function loadCategoryTrends(supabase: Awaited<ReturnType<typeof createClient>>): Promise<CategoryTrend[]> {
  const { data: recent } = await supabase
    .from("rounds")
    .select("id")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(TRENDS_WINDOW_ROUNDS)
  const roundIds = (recent ?? []).map((r) => r.id)
  if (roundIds.length === 0) return []
  const { data } = await supabase.from("round_analysis").select("*").in("round_id", roundIds)
  return aggregateCategoryTrends((data ?? []) as RoundAnalysis[])
}
