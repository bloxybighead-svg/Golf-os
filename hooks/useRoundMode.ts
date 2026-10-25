"use client"

// The one answer to "is a round or practice session going, and is this its screen?". `on` is true
// on Play with a round going, or on the runner with a session going, when not paused; `round` and `session`
// are whichever is going. Also keeps html[data-round] in step, which globals.css uses to hide the header
// and tab bar and which the inline script in lib/theme/themeScript.ts sets before first paint.

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { ACTIVE_ROUND_EVENT, loadActiveRound, type ActiveRound } from "@/lib/rounds/activeRound"
import { ACTIVE_SESSION_EVENT, loadActiveSession, type ActiveSession } from "@/lib/practice/activeSession"
import { inSessionMode } from "@/lib/practice/sessionMode"
import { ROUND_ATTR, ROUND_PAUSE_EVENT, inRoundMode, isRoundPaused, liveRound } from "@/lib/rounds/roundMode"

interface Snapshot {
  round: ActiveRound | null
  session: ActiveSession | null
  paused: boolean
}

export function useRoundMode(): { on: boolean; round: ActiveRound | null; session: ActiveSession | null } {
  const pathname = usePathname()
  // null until read in the browser: the server and the first client render agree, and the
  // attribute the inline script set is left alone until then.
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    const sync = () => setSnap({ round: liveRound(loadActiveRound()), session: loadActiveSession(), paused: isRoundPaused() })
    sync()
    window.addEventListener(ACTIVE_ROUND_EVENT, sync)
    window.addEventListener(ACTIVE_SESSION_EVENT, sync)
    window.addEventListener(ROUND_PAUSE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(ACTIVE_ROUND_EVENT, sync)
      window.removeEventListener(ACTIVE_SESSION_EVENT, sync)
      window.removeEventListener(ROUND_PAUSE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const round = snap?.round ?? null
  const session = snap?.session ?? null
  const on = snap != null && (inRoundMode(round, pathname, snap.paused) || inSessionMode(session, pathname, snap.paused))
  useEffect(() => {
    if (!snap) return
    const root = document.documentElement
    if (!round && !session) delete root.dataset[ROUND_ATTR]
    else root.dataset[ROUND_ATTR] = on ? "1" : "resume"
  }, [snap, round, session, on])
  return { on, round, session }
}
