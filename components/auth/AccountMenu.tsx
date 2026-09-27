"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, User } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export function AccountMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  if (!email) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-xs font-medium text-[#d1d5db] transition-colors hover:border-white/25 hover:text-white md:px-3 md:text-sm"
      >
        <User size={14} />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    )
  }

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    setOpen(false)
    // Order matters: push first so the destination route becomes "current",
    // then refresh so THAT route's server-rendered layout (including this
    // menu's signed-out state) is what gets refetched -- refreshing before
    // push can invalidate the wrong route if "/" was already cached from an
    // earlier, still-signed-in visit.
    router.push("/")
    router.refresh()
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.08] text-xs font-semibold text-white transition-colors hover:bg-white/[0.14]"
        title={email}
      >
        {email[0]?.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-[1300] w-56 rounded-xl border border-white/[0.1] bg-[#111111] p-2 shadow-2xl">
          <p className="truncate px-2 py-1.5 text-xs text-[#6b7280]">Signed in as</p>
          <p className="truncate px-2 pb-2 text-sm font-medium text-white">{email}</p>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-[#d1d5db] hover:bg-white/[0.06] disabled:opacity-50"
          >
            <LogOut size={14} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  )
}
