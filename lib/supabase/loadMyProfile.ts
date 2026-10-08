import type { SupabaseClient } from "@supabase/supabase-js"
import { fitFromRow, type ClubFit, type ProfileRow } from "@/lib/golfer/shotProfile"
import type { MyProfile } from "@/lib/planner/types"
import { baselineTemperatureF } from "@/lib/shots/temperature"

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
  const { data: sessions } = await supabase.from("shot_sessions").select("id, temperature_f").eq("excluded", false)
  const version = (rows as ProfileRow[]).reduce((latest, r) => (r.fitted_at && r.fitted_at > latest ? r.fitted_at : latest), "")
  return {
    fits,
    sessionCount: sessions?.length ?? Math.max(...fits.map((f) => f.sessionsUsed)),
    version,
    baselineTemperatureF: await loadBaselineTemperature(supabase, sessions ?? []),
  }
}

/**
 * The profile's baseline temperature: the shot-count-weighted average temperature over the included sessions that
 * have one (70 F when none do). Only sessions with a temperature need a shot count, so this is a handful of cheap
 * count queries, not a download of every shot. Partial swings are not counted, as in the fit.
 */
async function loadBaselineTemperature(supabase: SupabaseClient, sessions: { id: unknown; temperature_f: unknown }[]): Promise<number> {
  const withTemp = sessions.filter((s) => s.temperature_f != null && Number.isFinite(Number(s.temperature_f)))
  const entries = await Promise.all(
    withTemp.map(async (s) => {
      const { count } = await supabase.from("real_shots").select("id", { count: "exact", head: true }).eq("session_id", s.id as string).eq("is_partial", false)
      return { temperatureF: Number(s.temperature_f), shotCount: count ?? 0 }
    })
  )
  return baselineTemperatureF(entries)
}

/** Handicap used to blend thin clubs when the golfer has none on file. An estimate: the planner's own default. */
export const DEFAULT_BLEND_HANDICAP = 10

/** The handicap that thin clubs blend toward: tracked index, else the setup one, else the default. */
export async function loadBlendHandicap(supabase: SupabaseClient): Promise<number> {
  const [{ data: tracked }, { data: baseline }] = await Promise.all([
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("golfer_baseline").select("handicap_index").maybeSingle(),
  ])
  const h = Number(tracked?.handicap_index ?? baseline?.handicap_index)
  return Number.isFinite(h) ? Math.round(h) : DEFAULT_BLEND_HANDICAP
}
