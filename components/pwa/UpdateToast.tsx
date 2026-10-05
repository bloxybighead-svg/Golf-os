"use client"

import { useEffect, useState } from "react"
import { ACTIVE_ROUND_EVENT, loadActiveRound } from "@/lib/rounds/activeRound"

/**
 * "Update available", tap to reload. Hidden while a round is in progress: the toast
 * never reloads anything by itself, and during a round it does not even offer to.
 */
export function UpdateToast({ available, onUpdate }: { available: boolean; onUpdate: () => void }) {
  const [roundActive, setRoundActive] = useState(true) // assume a round until checked, so it cannot flash mid-round
  useEffect(() => {
    const check = () => setRoundActive(loadActiveRound() !== null)
    check()
    window.addEventListener(ACTIVE_ROUND_EVENT, check)
    window.addEventListener("focus", check)
    window.addEventListener("storage", check)
    return () => {
      window.removeEventListener(ACTIVE_ROUND_EVENT, check)
      window.removeEventListener("focus", check)
      window.removeEventListener("storage", check)
    }
  }, [])
  if (!available || roundActive) return null
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-[1200] mx-auto flex max-w-sm items-center justify-between gap-3 rounded-lg border border-fg/[0.12] bg-page px-4 py-2"
    >
      <p className="text-sm text-fg">Update available</p>
      <button onClick={onUpdate} className="min-h-[44px] text-sm font-semibold text-accent hover:underline">
        Reload
      </button>
    </div>
  )
}
