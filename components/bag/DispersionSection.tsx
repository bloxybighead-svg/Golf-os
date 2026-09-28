import { createClient } from "@/lib/supabase/server"
import { SimulatorClient, type ClubOption, type SimShot } from "@/components/simulator/SimulatorClient"

const GOLFER_NAME = "Dillon Cady"
const SOURCE_LABEL = "calibrated"

export async function DispersionSection() {
  const supabase = createClient()

  const { data: profiles, error: profilesError } = await supabase
    .from("golfer_profiles")
    .select("id, club, mean_carry_yds")
    .eq("golfer_name", GOLFER_NAME)
    .eq("source_label", SOURCE_LABEL)
    .order("mean_carry_yds", { ascending: false })

  if (profilesError || !profiles || profiles.length === 0) {
    return (
      <div className="rounded-xl border border-yellow-800/60 bg-yellow-950/30 px-5 py-4 text-sm text-yellow-400">
        <p className="font-semibold">No golfer profile found</p>
        <p className="mt-1 text-xs text-yellow-600">
          Expected a &ldquo;{GOLFER_NAME}&rdquo; / &ldquo;{SOURCE_LABEL}&rdquo; profile in golfer_profiles.
        </p>
      </div>
    )
  }

  // Supabase/PostgREST caps a single request at (by default) 1000 rows, so
  // page through in batches large enough to comfortably cover 2,000+ shots.
  const profileIds = profiles.map((p) => p.id)
  const pageSize = 1000
  const allShotRows: { golfer_profile_id: string; carry_yds: number; offline_yds: number; is_mishit: boolean }[] = []
  let shotsError: { message: string } | null = null
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from("simulated_shots")
      .select("golfer_profile_id, carry_yds, offline_yds, is_mishit")
      .in("golfer_profile_id", profileIds)
      .order("id") // stable order, or paging can skip and repeat rows
      .range(from, from + pageSize - 1)
    if (error) {
      shotsError = error
      break
    }
    if (!page || page.length === 0) break
    allShotRows.push(...page)
    if (page.length < pageSize) break
  }
  const shotRows = allShotRows

  if (shotsError) {
    return (
      <div className="rounded-xl border border-yellow-800/60 bg-yellow-950/30 px-5 py-4 text-sm text-yellow-400">
        <p className="font-semibold">Could not load simulated shots</p>
        <p className="mt-1 text-xs text-yellow-600">{shotsError.message}</p>
      </div>
    )
  }

  const clubById = new Map(profiles.map((p) => [p.id, p.club]))
  const clubs: ClubOption[] = profiles.map((p) => ({ club: p.club, meanCarryYds: Number(p.mean_carry_yds) }))
  const shots: SimShot[] = (shotRows ?? []).map((r) => ({
    club: clubById.get(r.golfer_profile_id) ?? "unknown",
    carryYds: Number(r.carry_yds),
    offlineYds: Number(r.offline_yds),
    isMishit: r.is_mishit,
  }))

  return <SimulatorClient clubs={clubs} shots={shots} golferName={GOLFER_NAME} />
}
