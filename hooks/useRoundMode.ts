"use client"

// The one answer to "is a round going, and is this the round screen?". `on` is true
// on Play with a round going that isn't paused; `round` is the round whenever one is
// going. Also keeps html[data-round] in step, which globals.css uses to hide the header
// and tab bar and which the inline script in lib/theme/themeScript.ts sets before first paint.

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { ACTIVE_ROUND_EVENT, loadActiveRound, type ActiveRound } from "@/lib/rounds/activeRound"
import { ROUND_ATTR, ROUND_PAUSE_EVENT, inRoundMode, isRoundPaused } from "@/lib/rounds/roundMode"

interface Snapshot {
  round: ActiveRound | null
  paused: boolean
}

export function useRoundMode(): { on: boolean; round: ActiveRound | null } {
  const pathname = usePathname()
  // null until read in the browser: the server and the first client render agree, and the
  // attribute the inline script set is left alone until then.
  const [snap, setSnap] = useState<Snapshot | null>(null)
  useEffect(() => {
    const sync = () => setSnap({ round: loadActiveRound(), paused: isRoundPaused() })
    sync()
    window.addEventListener(ACTIVE_ROUND_EVENT, sync)
    window.addEventListener(ROUND_PAUSE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(ACTIVE_ROUND_EVENT, sync)
      window.removeEventListener(ROUND_PAUSE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const round = snap?.round ?? null
  const on = snap != null && inRoundMode(round, pathname, snap.paused)
  useEffect(() => {
    if (!snap) return
    const root = document.documentElement
    if (!round) delete root.dataset[ROUND_ATTR]
    else root.dataset[ROUND_ATTR] = on ? "1" : "resume"
  }, [snap, round, on])
  return { on, round }
}
