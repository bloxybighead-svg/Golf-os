import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { loadBlendHandicap, loadMyProfile } from "@/lib/supabase/loadMyProfile"
import { generateMyBag } from "@/lib/golfer/shotProfile"
import { SimulatorClient, type ClubOption, type SimShot } from "@/components/simulator/SimulatorClient"

// Where the golfer's own shots land, club by club: generated from their fitted
// profile (the same shots the planner uses), not read from anyone else's rows.
export async function DispersionSection() {
  const supabase = await createClient()
  const [profile, handicap] = await Promise.all([loadMyProfile(supabase), loadBlendHandicap(supabase)])

  if (!profile) {
    return (
      <div className="rounded-xl border border-warn/40 bg-warn/10 px-5 py-4 text-sm text-warn">
        <p className="font-semibold">No shot data yet</p>
        <p className="mt-1 text-xs">
          Sign in and upload a launch-monitor file, or type in a few shots, on{" "}
          <Link href="/you/bag?view=shots" className="underline">
            My shot data
          </Link>
          .
        </p>
      </div>
    )
  }

  const bag = generateMyBag(profile.fits, profile.fits.map((f) => f.club), handicap)
  const clubs: ClubOption[] = profile.fits
    .map((f) => ({ club: f.club as string, meanCarryYds: f.profile.mean_carry }))
    .sort((a, b) => b.meanCarryYds - a.meanCarryYds)
  const shots: SimShot[] = bag.clubs.flatMap((c) => c.shots.map((s) => ({ club: c.club, carryYds: s.carryYds, offlineYds: s.offlineYds, isMishit: false })))

  return <SimulatorClient clubs={clubs} shots={shots} golferName="you" />
}
