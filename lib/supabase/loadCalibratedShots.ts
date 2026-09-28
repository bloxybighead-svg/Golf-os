import { createClient } from "@/lib/supabase/server"
import { seededSample } from "@/lib/dispersion/stats"

export interface CalibratedClubShots {
  club: string
  meanCarryYds: number
  shots: { carryYds: number; offlineYds: number }[]
}

/**
 * Loads a stored golfer's simulated shots grouped by club, thinned to at
 * most `perClub` shots each (deterministic subsample) so the payload stays
 * small enough to hand to a client component.
 */
export async function loadCalibratedShots(
  golferName: string,
  sourceLabel: string,
  perClub = 1000
): Promise<CalibratedClubShots[] | null> {
  const supabase = createClient()
  const { data: profiles, error } = await supabase
    .from("golfer_profiles")
    .select("id, club, mean_carry_yds")
    .eq("golfer_name", golferName)
    .eq("source_label", sourceLabel)
    .order("mean_carry_yds", { ascending: false })
  if (error || !profiles || profiles.length === 0) return null

  // Clubs load in parallel: this runs before the Play page can render, and one
  // club after another was ~30 sequential round trips (~2s) for an 11-club bag.
  const clubs = await Promise.all(
    profiles.map(async (p): Promise<CalibratedClubShots | null> => {
      const rows: { carry_yds: number; offline_yds: number }[] = []
      for (let from = 0; ; from += 1000) {
        const { data: page, error: e } = await supabase
          .from("simulated_shots")
          .select("carry_yds, offline_yds")
          .eq("golfer_profile_id", p.id)
          .order("id") // stable order, or paging can skip and repeat rows
          .range(from, from + 999)
        if (e) return null
        if (!page || page.length === 0) break
        rows.push(...page)
        if (page.length < 1000) break
      }
      const shots = rows.map((r) => ({ carryYds: Number(r.carry_yds), offlineYds: Number(r.offline_yds) }))
      return { club: p.club, meanCarryYds: Number(p.mean_carry_yds), shots: seededSample(shots, perClub, 17) }
    })
  )
  if (clubs.some((c) => c == null)) return null
  return clubs as CalibratedClubShots[]
}
