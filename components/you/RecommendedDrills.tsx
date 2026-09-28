"use client"

import { useState } from "react"
import { Target, Clock, Repeat } from "lucide-react"
import type { LibraryDrill } from "@/lib/supabase/types"
import type { CategoryTrend } from "@/lib/sgBenchmarks"
import { CATEGORY_LABEL } from "@/lib/drillRecommendations"
import { DrillModal } from "./DrillModal"

function fmtDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "–" : ""
  return `${sign}${Math.abs(n).toFixed(2)} SG`
}

export function RecommendedDrills({
  focus,
  handicapIndex,
  drills,
  signedIn,
}: {
  focus: CategoryTrend | null
  handicapIndex: number | null
  drills: LibraryDrill[]
  signedIn: boolean
}) {
  const [open, setOpen] = useState<LibraryDrill | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  if (!focus || drills.length === 0) {
    return (
      <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
        <p className="label-xs mb-2">Recommended Drills</p>
        <p className="text-sm text-faint">
          Drill recommendations appear once Strengths &amp; Weaknesses has data to find your weakest area.
        </p>
      </div>
    )
  }

  const label = CATEGORY_LABEL[focus.category]

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Target size={15} className="text-accent" />
        <p className="label-xs">Recommended Drills</p>
      </div>
      <p className="mt-2 text-sm text-fg">
        Focus area: <span className="font-semibold">{label}</span>{" "}
        <span className={focus.avgDeltaSg < 0 ? "text-danger" : "text-accent"}>
          ({fmtDelta(focus.avgDeltaSg)} vs. {handicapIndex != null ? `your ${handicapIndex.toFixed(1)} HCP` : "your handicap"})
        </span>
      </p>
      {focus.avgDeltaSg >= 0 && (
        <p className="mt-0.5 text-xs text-muted">Every area is at or above your level — this is the one with the least margin.</p>
      )}

      {/* Phones: horizontal swipe row of compact cards. Desktop: grid. */}
      <div className="-mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:scroll-px-0 md:px-0">
        {drills.map((d, i) => (
          <div
            key={d.id}
            className="flex w-[78%] shrink-0 snap-start flex-col rounded-lg border border-fg/[0.06] bg-surface-2 p-3.5 md:w-auto"
          >
            <p className="text-xs text-faint">{i + 1}.</p>
            <p className="text-sm font-semibold text-fg">{d.name}</p>
            {d.target_area && <p className="mt-0.5 text-xs text-fg-3">Target: {d.target_area}</p>}
            {d.description && <p className="mt-1.5 text-xs text-muted">{d.description}</p>}
            <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
              {d.reps_suggested != null && <span className="flex items-center gap-1"><Repeat size={11} /> {d.reps_suggested} reps</span>}
              {d.time_estimate_mins != null && <span className="flex items-center gap-1"><Clock size={11} /> {d.time_estimate_mins} min</span>}
            </div>
            <p className="mt-2 text-xs text-muted">
              Why: your {label.toLowerCase()} is {fmtDelta(focus.avgDeltaSg)} vs. your handicap
            </p>
            <div className="flex-1" />
            <button
              onClick={() => setOpen(d)}
              className="mt-3 w-full rounded-lg border border-accent/40 bg-accent/10 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
            >
              Start Drill
            </button>
          </div>
        ))}
      </div>

      {savedNote && <p className="mt-3 text-xs text-accent">{savedNote}</p>}

      {open && (
        <DrillModal
          drill={open}
          signedIn={signedIn}
          onClose={() => setOpen(null)}
          onCompleted={() => {
            setSavedNote(`${open.name} saved to Drill History.`)
            setOpen(null)
            setTimeout(() => setSavedNote(null), 5000)
          }}
        />
      )}
    </div>
  )
}
