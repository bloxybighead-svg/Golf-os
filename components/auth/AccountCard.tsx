"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, User } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

// Account lives on the You tab now that the top bar carries only the wordmark.
export function AccountCard({ email }: { email: string | null }) {
  const [signingOut, setSigningOut] = useState(false)
  const router = useRouter()

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    // Order matters: push first so the destination route becomes "current",
    // then refresh so THAT route's server-rendered content is what gets
    // refetched -- refreshing before push can invalidate the wrong route if
    // "/" was already cached from an earlier, still-signed-in visit.
    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-sm font-semibold text-white">
          {email ? email[0]?.toUpperCase() : <User size={16} />}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-[#6b7280]">{email ? "Signed in as" : "Not signed in"}</p>
          <p className="truncate text-sm font-medium text-white">{email ?? "Save your rounds"}</p>
        </div>
      </div>
      {email ? (
        <button
          onClick={signOut}
          disabled={signingOut}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-xs font-medium text-[#d1d5db] transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
        >
          <LogOut size={13} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      ) : (
        <Link
          href="/login"
          className="shrink-0 rounded-lg bg-[#22c55e] px-4 py-1.5 text-xs font-semibold text-black transition-all hover:brightness-110"
        >
          Sign in
        </Link>
      )}
    </div>
  )
}
