import type { SupabaseClient } from "@supabase/supabase-js"
import { fitFromRow, type ClubFit, type ProfileRow } from "@/lib/golfer/shotProfile"
import type { MyProfile } from "@/lib/planner/types"

/**
 * The signed-in golfer's own fitted profile (shot_profiles) and how many of
 * their sessions it is built from. null when signed out or when they have no
 * profile yet. Row-level security keeps each query to the caller's own rows.
 */
export async function loadMyProfile(supabase: SupabaseClient): Promise<MyProfile | null> {
  const { data: rows, error } = await supabase.from("shot_profiles").select("club, params, n_shots, sessions_used, fitted_at")
  if (error || !rows || rows.length === 0) return null
  const fits = (rows as ProfileRow[]).flatMap((r): ClubFit[] => {
    const f = fitFromRow(r)
    return f ? [f] : []
  })
  if (fits.length === 0) return null
  const { data: sessions } = await supabase.from("shot_sessions").select("id").eq("excluded", false)
  const version = (rows as ProfileRow[]).reduce((latest, r) => (r.fitted_at && r.fitted_at > latest ? r.fitted_at : latest), "")
  return { fits, sessionCount: sessions?.length ?? Math.max(...fits.map((f) => f.sessionsUsed)), version }
}
