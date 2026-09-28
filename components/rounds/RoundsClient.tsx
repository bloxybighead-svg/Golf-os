"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { MoreHorizontal } from "lucide-react"
import type { Round } from "@/lib/supabase/types"
import { toCSV, downloadCSV } from "@/lib/csv"
import { RoundCard } from "./RoundCard"
import { RoundForm } from "./RoundForm"

interface Props {
  rounds: Round[]
  casualGirAvg: number | null
  /** The hero number and supporting stats, built on the server. */
  summary: ReactNode
  initialAdding?: boolean
}

export function RoundsClient({ rounds, casualGirAvg, summary, initialAdding = false }: Props) {
  const [adding, setAdding] = useState(initialAdding)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the overflow menu on an outside tap.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [menuOpen])

  if (adding) {
    return <RoundForm onDone={() => setAdding(false)} />
  }

  // The most recent 20 rounds (the list arrives date-descending from the page).
  function exportLast20() {
    const stamp = new Date().toISOString().split("T")[0]
    downloadCSV(`golf-os-last-20-rounds-${stamp}.csv`, toCSV(rounds.slice(0, 20) as unknown as Record<string, unknown>[]))
    setMenuOpen(false)
  }

  const addButton = (
    <button
      onClick={() => setAdding(true)}
      className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-all hover:brightness-110 md:h-10"
    >
      Add round
    </button>
  )

  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-fg">Rounds</h2>
        {rounds.length > 0 && (
          <div className="flex items-center gap-2">
            {addButton}
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More"
                aria-expanded={menuOpen}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-fg/[0.08] text-fg-3 transition-colors hover:text-fg md:h-10 md:w-10"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-fg/[0.1] bg-page p-1.5 shadow-2xl">
                  <button
                    onClick={exportLast20}
                    className="flex min-h-[40px] w-full items-center rounded-md px-2.5 text-left text-sm text-fg-2 hover:bg-fg/[0.06] hover:text-fg"
                  >
                    Export last 20 (CSV)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {rounds.length === 0 ? (
        <div className="rounded-xl border border-fg/[0.06] bg-surface py-16 text-center">
          <p className="text-base font-semibold text-fg">No rounds yet.</p>
          <div className="mt-4">{addButton}</div>
        </div>
      ) : (
        <>
          {summary}
          <div className="space-y-2.5">
            {rounds.map((round) => (
              <RoundCard key={round.id} round={round} casualGirAvg={casualGirAvg} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
