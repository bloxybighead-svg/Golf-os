import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { supabaseShotDb } from "@/lib/shots/store"
import { ShotDataClient } from "@/components/shots/ShotDataClient"

export async function ShotDataSection() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="rounded-xl border border-fg/[0.08] bg-surface px-5 py-6 text-sm">
        <p className="font-semibold text-fg">Sign in to keep your shot data.</p>
        <p className="mt-1 text-fg-3">Your shots are saved to your account and visible only to you.</p>
        <Link href="/login?redirect=%2Fyou%2Fbag%2Fshots" className="mt-4 inline-flex h-11 items-center rounded-lg bg-accent px-4 font-semibold text-on-accent hover:brightness-110">
          Sign in
        </Link>
      </div>
    )
  }

  const db = supabaseShotDb(supabase, user.id)
  const [sessions, shots, profileRows] = await Promise.all([db.listSessions(), db.listShots(), db.listProfileRows()])
  return <ShotDataClient userId={user.id} initial={{ sessions, shots, profileRows }} />
}
