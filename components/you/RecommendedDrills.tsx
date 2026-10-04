"use client"

import { useState } from "react"
import { EmptyHint } from "@/components/EmptyHint"
import { ChevronDown, Target, Clock, Repeat } from "lucide-react"
import type { LibraryDrill } from "@/lib/supabase/types"
import type { CategoryTrend, SgCategory } from "@/lib/sgBenchmarks"
import { CATEGORY_LABEL, DRILL_CATEGORIES } from "@/lib/drillRecommendations"
import { DrillModal } from "./DrillModal"

function fmtDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "–" : ""
  return `${sign}${Math.abs(n).toFixed(2)} SG`
}

// Opens on the golfer's weakest category (as on Strengths & Weaknesses); the
// dropdown shows any of the four on request.
export function RecommendedDrills({
  focus,
  trends,
  handicapIndex,
  drillsByCategory,
  signedIn,
}: {
  focus: CategoryTrend | null
  trends: readonly CategoryTrend[]
  handicapIndex: number | null
  drillsByCategory: Record<SgCategory, LibraryDrill[]>
  signedIn: boolean
}) {
  const [open, setOpen] = useState<LibraryDrill | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [category, setCategory] = useState<SgCategory>(focus?.category ?? DRILL_CATEGORIES[0])

  const drills = drillsByCategory[category] ?? []
  const trend = trends.find((t) => t.category === category) ?? null
  const label = CATEGORY_LABEL[category]
  const vsHandicap = handicapIndex != null ? `your ${handicapIndex.toFixed(1)} HCP` : "your handicap"

  return (
    <div id="recommended-drills" className="scroll-mt-20 rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <div className="flex items-center gap-2">
        <Target size={15} className="text-accent" />
        <p className="label-xs">Recommended Drills</p>
      </div>

      <div className="relative mt-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as SgCategory)}
          aria-label="Drills for"
          className="w-full appearance-none rounded-lg border border-fg/[0.08] bg-surface-3 py-2.5 pl-3 pr-9 text-sm font-medium text-fg focus:border-accent focus:outline-none"
        >
          {DRILL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
              {focus?.category === c ? " (weakest)" : ""}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
      </div>

      {trend ? (
        <>
          <p className="mt-3 text-sm text-fg">
            {trend.category === focus?.category && "Focus area: "}
            <span className="font-semibold">{label}</span>{" "}
            <span className={trend.avgDeltaSg < 0 ? "text-danger" : "text-accent"}>
              ({fmtDelta(trend.avgDeltaSg)} vs. {vsHandicap})
            </span>
          </p>
          {trend.category === focus?.category && trend.avgDeltaSg >= 0 && (
            <p className="mt-0.5 text-xs text-muted">Every area is at or above your level. This one has the least margin.</p>
          )}
        </>
      ) : (
        <EmptyHint action="Log a round hole by hole" href="/rounds?new=1" className="mt-3 text-sm text-fg-3">
          No {label.toLowerCase()} stats yet.
        </EmptyHint>
      )}

      {drills.length === 0 && <p className="mt-4 text-sm text-fg-3">No {label.toLowerCase()} drills in the library yet.</p>}

      {/* Phones: horizontal swipe row of compact cards. Desktop: grid. */}
      <div className="-mx-5 mt-4 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:scroll-px-0 md:px-0">
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
            {trend && (
              <p className="mt-2 text-xs text-muted">
                Why: your {label.toLowerCase()} is {fmtDelta(trend.avgDeltaSg)} vs. your handicap
              </p>
            )}
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
