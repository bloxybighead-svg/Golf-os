import type { createClient } from "@/lib/supabase/server"
import { BAG_ORDER } from "@/lib/golfer/tables"
import { generateCustomGolferShots } from "@/lib/golfer/build"
import { generateMyBag } from "@/lib/golfer/shotProfile"
import { loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { fromDbRow, type RoundShot, type RoundShotRow } from "@/lib/rounds/shots"
import { lateralSamples, MIN_GROUP_SHOTS, modelSpread, suggestSpread, type SpreadSuggestion } from "@/lib/rounds/spreadCalibration"

/** Rows come back at most this many at a time (the API's own cap), and at most PAGES times: the most recent shots are enough. */
const PAGE = 1000
const PAGES = 5
/** Shots per club the planner's own spread is measured on: the planner's own number (hooks/usePlan.ts). */
const MODEL_SHOTS_PER_CLUB = 1000
const MODEL_SEED = 42

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * How much wider the golfer's recorded misses are than the planner's own shots, for You -> Planner. The planner's
 * shots are the ones Play starts on: the golfer's own profile when they have one, else a golfer of their handicap.
 * null without a handicap, or until a club group has enough shots.
 */
export async function loadSpreadSuggestion(supabase: Supabase): Promise<SpreadSuggestion | null> {
  const rows: (RoundShotRow & { round_id: string })[] = []
  for (let page = 0; page < PAGES; page++) {
    const { data } = await supabase
      .from("round_shots")
      .select("round_id, hole_number, shot_number, club, from_lat, from_lng, from_lie, to_lat, to_lng, to_lie, penalty_strokes")
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * PAGE, (page + 1) * PAGE - 1)
    rows.push(...((data ?? []) as typeof rows))
    if ((data?.length ?? 0) < PAGE) break
  }
  const byRound = new Map<string, RoundShot[]>()
  for (const r of rows) byRound.set(r.round_id, [...(byRound.get(r.round_id) ?? []), fromDbRow(r)])
  const samples = lateralSamples([...byRound.values()])
  if (samples.length < MIN_GROUP_SHOTS) return null

  const [{ data: tracked }, { data: baseline }, profile] = await Promise.all([
    supabase.from("handicap_tracking").select("handicap_index").order("calculation_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("golfer_baseline").select("handicap_index").maybeSingle(),
    loadMyProfile(supabase),
  ])
  const handicap = tracked?.handicap_index ?? baseline?.handicap_index
  if (handicap == null) return null

  const planner = profile
    ? generateMyBag(profile.fits, BAG_ORDER, Math.round(Number(handicap)), MODEL_SHOTS_PER_CLUB).clubs
    : BAG_ORDER.map((club) => ({
        club,
        shots: generateCustomGolferShots({ handicapIndex: Number(handicap) }, MODEL_SHOTS_PER_CLUB, MODEL_SEED, [club]),
      }))
  return suggestSpread(samples, modelSpread(planner))
}
