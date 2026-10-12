"use client"

import { usePathname, useRouter } from "next/navigation"
import { useIsCompact } from "@/hooks/useIsCompact"
import { useRoundMode } from "@/hooks/useRoundMode"
import { nextUnscored } from "@/lib/rounds/activeRound"
import { setRoundPaused } from "@/lib/rounds/roundMode"

/**
 * A round is going but the golfer is in the normal app (paused, or on another page):
 * one slim bar above the tab bar that goes back to it. Phones only; the round screen is a phone screen.
 */
export function ResumeBar() {
  const { on, round } = useRoundMode()
  const compact = useIsCompact()
  const pathname = usePathname()
  const router = useRouter()
  if (!round || on || !compact) return null
  return (
    <button
      type="button"
      onClick={() => {
        setRoundPaused(false)
        if (pathname !== "/") router.push("/")
      }}
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 flex h-10 items-center justify-between border-t border-fg/[0.08] bg-surface px-4 text-sm md:bottom-0 md:pb-[env(safe-area-inset-bottom)]"
    >
      <span className="min-w-0 truncate text-fg tabular-nums">Round in progress · H{nextUnscored(round) ?? round.startHole}</span>
      <span className="shrink-0 font-semibold text-accent">Resume</span>
    </button>
  )
}
