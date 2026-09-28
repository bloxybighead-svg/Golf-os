import { createClient } from "@/lib/supabase/server"
import { estimateHandicapIndex, needsNewCalculatedEntry } from "@/lib/handicap"

/**
 * Recomputes the handicap estimate from the golfer's last 20 rounds and records
 * it when it changed. Called after a round is added, edited or deleted, so the
 * index is never stale and there's no Recalculate button to remember. Never
 * throws: a failure here mustn't fail the round save that triggered it.
 */
export async function syncCalculatedHandicap(supabase: ReturnType<typeof createClient>, userId: string): Promise<void> {
  try {
    const [{ data: rounds }, { data: latest }] = await Promise.all([
      supabase
        .from("rounds")
        .select("differential")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("handicap_tracking")
        .select("source, handicap_index")
        .order("calculation_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const diffs = (rounds ?? []).map((r) => r.differential as number | null).filter((d): d is number => d != null)
    const index = estimateHandicapIndex(diffs)
    if (!needsNewCalculatedEntry(latest ?? null, index)) return
    await supabase.from("handicap_tracking").insert({
      user_id: userId,
      handicap_index: index,
      source: "calculated",
      rounds_used: diffs.length,
    })
  } catch {
    // Leave the previous index in place; the next round save retries.
  }
}
