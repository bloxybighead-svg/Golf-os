import { createClient } from "@/lib/supabase/server"
import { CompareClient, type GolferOption, type CompareShot, type RealShot } from "@/components/simulator/CompareClient"

async function fetchAllShots(
  supabase: ReturnType<typeof createClient>,
  profileIds: string[]
): Promise<{ golfer_profile_id: string; carry_yds: number; offline_yds: number; is_mishit: boolean }[]> {
  const pageSize = 1000
  const all: { golfer_profile_id: string; carry_yds: number; offline_yds: number; is_mishit: boolean }[] = []
  for (let from = 0; ; from += pageSize) {
    const { data: page, error } = await supabase
      .from("simulated_shots")
      .select("golfer_profile_id, carry_yds, offline_yds, is_mishit")
      .in("golfer_profile_id", profileIds)
      .order("id") // stable order, or paging can skip and repeat rows
      .range(from, from + pageSize - 1)
    if (error || !page || page.length === 0) break
    all.push(...page)
    if (page.length < pageSize) break
  }
  return all
}

export async function CompareSection() {
  const supabase = createClient()

  const { data: profiles, error: profilesError } = await supabase
    .from("golfer_profiles")
    .select("id, golfer_name, source_label, club, mean_carry_yds")
    .order("mean_carry_yds", { ascending: false })

  if (profilesError || !profiles || profiles.length === 0) {
    return (
      <div className="rounded-xl border border-yellow-800/60 bg-yellow-950/30 px-5 py-4 text-sm text-yellow-400">
        <p className="font-semibold">No golfer profiles found</p>
      </div>
    )
  }

  const profileIds = profiles.map((p) => p.id)
  const shotRows = await fetchAllShots(supabase, profileIds)

  const { data: realShotRows } = await supabase
    .from("real_shots")
    .select("golfer_name, club, carry_yds, offline_yds")

  const profileById = new Map(profiles.map((p) => [p.id, p]))

  // One "golfer option" per distinct (golfer_name, source_label) pair.
  const golferKeySet = new Map<string, GolferOption>()
  for (const p of profiles) {
    const key = `${p.golfer_name}::${p.source_label}`
    if (!golferKeySet.has(key)) {
      golferKeySet.set(key, { key, golferName: p.golfer_name, sourceLabel: p.source_label, clubs: [] })
    }
    golferKeySet.get(key)!.clubs.push({ club: p.club, meanCarryYds: Number(p.mean_carry_yds) })
  }
  const golfers = Array.from(golferKeySet.values())

  const shots: CompareShot[] = shotRows.map((r) => {
    const p = profileById.get(r.golfer_profile_id)!
    return {
      golferKey: `${p.golfer_name}::${p.source_label}`,
      club: p.club,
      carryYds: Number(r.carry_yds),
      offlineYds: Number(r.offline_yds),
      isMishit: r.is_mishit,
    }
  })

  const realShots: RealShot[] = (realShotRows ?? []).map((r) => ({
    golferName: r.golfer_name,
    club: r.club,
    carryYds: Number(r.carry_yds),
    offlineYds: Number(r.offline_yds),
  }))

  return <CompareClient golfers={golfers} shots={shots} realShots={realShots} />
}
