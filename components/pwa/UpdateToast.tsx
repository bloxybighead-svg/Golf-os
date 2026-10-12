"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { dockCssVars } from "@/lib/planner/dock"
import { ACTIVE_ROUND_EVENT, loadActiveRound } from "@/lib/rounds/activeRound"

/**
 * "Update available", tap to reload. Hidden while a round is in progress: the toast
 * never reloads anything by itself, and during a round it does not even offer to.
 */
export function UpdateToast({ available, onUpdate }: { available: boolean; onUpdate: () => void }) {
  const [dismissed, setDismissed] = useState(false) // until the app is reopened
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
  if (!available || roundActive || dismissed) return null
  return (
    <div
      role="status"
      style={dockCssVars}
      className="fixed inset-x-4 bottom-[calc(var(--tab-h)+var(--dock-h)+env(safe-area-inset-bottom)+0.5rem)] z-[1200] mx-auto flex max-w-sm items-center justify-between gap-1 rounded-lg border border-fg/[0.12] bg-page py-0.5 pl-4 pr-0.5 md:bottom-auto md:top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)]"
    >
      <p className="min-w-0 flex-1 text-sm text-fg">Update available</p>
      <button onClick={onUpdate} className="min-h-[44px] px-2 text-sm font-semibold text-accent hover:underline">
        Reload
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="flex h-11 w-11 items-center justify-center text-fg-3 hover:text-fg">
        <X size={18} />
      </button>
    </div>
  )
}
