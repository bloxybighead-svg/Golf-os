"use client"

import { useState } from "react"
import type { Round } from "@/lib/supabase/types"
import { RoundCard } from "./RoundCard"
import { RoundForm } from "./RoundForm"

interface Props {
  rounds: Round[]
}

export function RoundsClient({ rounds }: Props) {
  const [adding, setAdding] = useState(false)

  if (adding) {
    return <RoundForm onDone={() => setAdding(false)} />
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Rounds</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            {rounds.length === 0
              ? "No rounds logged yet"
              : `${rounds.length} round${rounds.length !== 1 ? "s" : ""} logged`}
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-lg bg-[#22c55e] px-5 py-2.5 text-sm font-semibold text-black shadow-md shadow-[#22c55e]/20 transition-all hover:brightness-110 hover:scale-[1.03] active:scale-[0.97]"
        >
          <span className="text-base leading-none">+</span>
          <span>Add Round</span>
        </button>
      </div>

      {/* Empty state */}
      {rounds.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] py-20 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1a1a1a] shadow-lg shadow-[#22c55e]/20 ring-1 ring-[#22c55e]/20">
            {/* Golf hole flag SVG */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="19" r="2"/>
              <path d="M12 17V5"/>
              <path d="M12 5l6 3-6 3"/>
            </svg>
          </div>
          <p className="text-base font-semibold text-white">No rounds logged yet</p>
          <p className="mt-1.5 text-sm text-[#6b7280]">Add a past or upcoming round above.</p>
        </div>
      )}

      {/* Rounds list */}
      {rounds.length > 0 && (
        <div className="space-y-2.5">
          {rounds.map((round) => (
            <RoundCard key={round.id} round={round} />
          ))}
        </div>
      )}
    </div>
  )
}
