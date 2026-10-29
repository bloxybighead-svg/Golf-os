"use client"

import { usePathname, useRouter } from "next/navigation"
import { useIsCompact } from "@/hooks/useIsCompact"
import { useRoundMode } from "@/hooks/useRoundMode"
import { SESSION_PATH, isUnsaved } from "@/lib/practice/activeSession"
import { progress } from "@/lib/practice/runner"
import { nextUnscored } from "@/lib/rounds/activeRound"
import { setRoundPaused } from "@/lib/rounds/roundMode"

/**
 * A round or practice session is going but the golfer is in the normal app (paused, or on another page):
 * one slim bar above the tab bar that goes back to it. Phones only; both are phone screens. A round comes first.
 */
export function ResumeBar() {
  const { on, round, session } = useRoundMode()
  const compact = useIsCompact()
  const pathname = usePathname()
  const router = useRouter()
  if ((!round && !session) || on || !compact) return null
  const target = round ? "/" : SESSION_PATH
  return (
    <button
      type="button"
      onClick={() => {
        setRoundPaused(false)
        if (pathname !== target) router.push(target)
      }}
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 flex h-11 items-center justify-between border-t border-fg/[0.08] bg-surface px-4 text-sm md:bottom-0 md:pb-[env(safe-area-inset-bottom)]"
    >
      <span className="min-w-0 truncate text-fg">
        {round ? `Round in progress · H${nextUnscored(round) ?? round.startHole}` : isUnsaved(session!) ? "Unsaved practice · Save or discard" : `Practice in progress · Set ${Math.min(progress(session!).done + 1, progress(session!).total)} of ${progress(session!).total}`}
      </span>
      <span className="shrink-0 font-semibold text-accent">{!round && isUnsaved(session!) ? "Finish" : "Resume"}</span>
    </button>
  )
}
