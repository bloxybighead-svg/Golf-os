"use client"

import { useState } from "react"
import { Target, Clock, Repeat } from "lucide-react"
import type { LibraryDrill } from "@/lib/supabase/types"
import type { SgCategory } from "@/lib/sgBenchmarks"
import { CATEGORY_LABEL, DRILL_CATEGORIES, MIN_ROUNDS_FOR_FOCUS, focusAreas, trendsFromLoss } from "@/lib/drillRecommendations"
import { categoryStrokesLostPerRound } from "@/lib/rounds/roundSg"
import { useSgResults } from "@/hooks/useSgResults"
import type { ClubFit } from "@/lib/golfer/shotProfile"
import type { SgRoundData } from "@/lib/supabase/loadSgData"
import { DrillModal } from "./DrillModal"

function fmtDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "–" : ""
  return `${sign}${Math.abs(n).toFixed(2)} SG`
}

// Drills for the focus area (two on a close call). Until there are enough
// rounds to name one, all four categories are listed unranked.
export function RecommendedDrills({
  sgData,
  fits,
  handicapIndex,
  drillsByCategory,
  signedIn,
}: {
  sgData: SgRoundData[]
  fits: ClubFit[] | null
  handicapIndex: number | null
  drillsByCategory: Record<SgCategory, LibraryDrill[]>
  signedIn: boolean
}) {
  const [open, setOpen] = useState<LibraryDrill | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  const { label, results } = useSgResults(sgData, fits, handicapIndex)
  const focus = focusAreas(trendsFromLoss(categoryStrokesLostPerRound(results)))
  const sections = focus.length > 0 ? focus.map((t) => t.category) : DRILL_CATEGORIES

  return (
    <div id="recommended-drills" className="scroll-mt-20 rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <div className="flex items-center gap-2">
        <Target size={15} className="text-accent" />
        <p className="label-xs">Recommended Drills</p>
      </div>

      {focus.length === 0 && <p className="mt-3 text-sm text-fg">Log {MIN_ROUNDS_FOR_FOCUS} rounds to get a focus area</p>}
      {focus.length === 2 && (
        <p className="mt-3 text-sm font-semibold text-fg">
          Close call: {CATEGORY_LABEL[focus[0].category].toLowerCase()} and {CATEGORY_LABEL[focus[1].category].toLowerCase()}
        </p>
      )}

      {sections.map((category) => {
        const trend = focus.find((t) => t.category === category)
        const label = CATEGORY_LABEL[category]
        const drills = drillsByCategory[category] ?? []
        return (
          <section key={category} className="mt-4">
            {trend ? (
              <p className="text-sm text-fg">
                <span className="font-semibold">{label}</span>{" "}
                <span className={trend.avgDeltaSg < 0 ? "text-danger" : "text-accent"}>{fmtDelta(trend.avgDeltaSg)}</span> vs. {label},{" "}
                {trend.roundsCounted} rounds
              </p>
            ) : (
              <p className="text-sm font-semibold text-fg">{label}</p>
            )}
            {drills.length === 0 && <p className="mt-2 text-sm text-fg-3">No {label.toLowerCase()} drills in the library yet.</p>}
            {/* Phones: horizontal swipe row of compact cards. Desktop: grid. */}
            <div className="-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:scroll-px-0 md:px-0">
              {drills.map((d, i) => (
                <div
                  key={d.id}
                  className="flex w-[78%] shrink-0 snap-start flex-col rounded-lg border border-fg/[0.06] bg-surface-2 p-3.5 md:w-auto"
                >
                  <p className="text-xs text-muted">{i + 1}.</p>
                  <p className="text-sm font-semibold text-fg">{d.name}</p>
                  {d.target_area && <p className="mt-0.5 text-xs text-fg-3">Target: {d.target_area}</p>}
                  {d.description && <p className="mt-1.5 text-xs text-muted">{d.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                    {d.reps_suggested != null && <span className="flex items-center gap-1"><Repeat size={11} /> {d.reps_suggested} reps</span>}
                    {d.time_estimate_mins != null && <span className="flex items-center gap-1"><Clock size={11} /> {d.time_estimate_mins} min</span>}
                  </div>
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
          </section>
        )
      })}

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
