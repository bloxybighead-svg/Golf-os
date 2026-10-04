import { createClient } from "@/lib/supabase/server"
import { CompareClient, MY_GOLFER_NAME, type GolferOption, type CompareShot, type RealShot } from "@/components/simulator/CompareClient"
import { loadBlendHandicap, loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { generateMyBag } from "@/lib/golfer/shotProfile"
import { supabaseShotDb } from "@/lib/shots/store"

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
    .neq("source", "calibrated") // real golfers' profiles are private; the golfer's own comes from shot_profiles below
    .order("mean_carry_yds", { ascending: false })

  if (profilesError || !profiles || profiles.length === 0) {
    return (
      <div className="rounded-xl border border-warn/40 bg-warn/10 px-5 py-4 text-sm text-warn">
        <p className="font-semibold">No golfer profiles found</p>
      </div>
    )
  }

  const profileIds = profiles.map((p) => p.id)
  const shotRows = await fetchAllShots(supabase, profileIds)

  // The golfer's own profile, generated the way the planner does it, and their own real shots.
  const [{ data: auth }, myProfile, handicap] = await Promise.all([supabase.auth.getUser(), loadMyProfile(supabase), loadBlendHandicap(supabase)])

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
  const mineKey = `${MY_GOLFER_NAME}::my shots`
  const myBag = myProfile ? generateMyBag(myProfile.fits, myProfile.fits.map((f) => f.club), handicap, 2000) : null
  if (myProfile) {
    golfers.unshift({
      key: mineKey,
      golferName: MY_GOLFER_NAME,
      sourceLabel: "my shots",
      clubs: myProfile.fits.map((f) => ({ club: f.club as string, meanCarryYds: f.profile.mean_carry })).sort((a, b) => b.meanCarryYds - a.meanCarryYds),
    })
  }

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

  for (const c of myBag?.clubs ?? []) {
    for (const s of c.shots) shots.push({ golferKey: mineKey, club: c.club, carryYds: s.carryYds, offlineYds: s.offlineYds, isMishit: false })
  }

  const myShots = auth.user ? await supabaseShotDb(supabase, auth.user.id).listShots() : []
  const realShots: RealShot[] = myShots
    .filter((s) => !s.isPartial)
    .map((s) => ({ golferName: MY_GOLFER_NAME, club: s.club, carryYds: s.carryYds, offlineYds: s.offlineYds }))

  return <CompareClient golfers={golfers} shots={shots} realShots={realShots} />
}
