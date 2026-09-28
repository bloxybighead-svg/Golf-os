"use client"

import { useState } from "react"
import type { Round } from "@/lib/supabase/types"
import { RoundCard } from "./RoundCard"
import { RoundForm } from "./RoundForm"
import { ExportLast20Button } from "./ExportLast20Button"

interface Props {
  rounds: Round[]
  casualGirAvg: number | null
  initialAdding?: boolean
}

export function RoundsClient({ rounds, casualGirAvg, initialAdding = false }: Props) {
  const [adding, setAdding] = useState(initialAdding)

  if (adding) {
    return <RoundForm onDone={() => setAdding(false)} />
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-fg">Rounds</h2>
          <p className="mt-1 text-sm text-muted">
            {rounds.length === 0
              ? "No rounds logged yet"
              : `${rounds.length} round${rounds.length !== 1 ? "s" : ""} logged`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportLast20Button rounds={rounds} />
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-md shadow-accent/20 transition-all hover:brightness-110 hover:scale-[1.03] active:scale-[0.97]"
          >
            <span className="text-base leading-none">+</span>
            <span>Add Round</span>
          </button>
        </div>
      </div>

      {/* Empty state */}
      {rounds.length === 0 && (
        <div className="rounded-xl border border-fg/[0.06] bg-surface py-20 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-3 shadow-lg shadow-accent/20 ring-1 ring-accent/20">
            {/* Golf hole flag SVG */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="19" r="2"/>
              <path d="M12 17V5"/>
              <path d="M12 5l6 3-6 3"/>
            </svg>
          </div>
          <p className="text-base font-semibold text-fg">No rounds logged yet</p>
          <p className="mt-1.5 text-sm text-muted">Add a past or upcoming round above.</p>
        </div>
      )}

      {/* Rounds list */}
      {rounds.length > 0 && (
        <div className="space-y-2.5">
          {rounds.map((round) => (
            <RoundCard key={round.id} round={round} casualGirAvg={casualGirAvg} />
          ))}
        </div>
      )}
    </div>
  )
}
