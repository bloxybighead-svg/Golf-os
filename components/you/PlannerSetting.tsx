"use client"

import { useEffect, useState } from "react"
import { readCompareAgainst, saveCompareAgainst, type CompareAgainst } from "@/lib/course/baseline"
import { readRisk, saveRisk } from "@/lib/course/riskSetting"
import { clampSpread, readSpread, saveSpread } from "@/lib/course/spreadSetting"
import type { SpreadSuggestion } from "@/lib/rounds/spreadCalibration"
import { ON_COURSE_SPREAD, RISK_STOPS, SPREAD_MAX, SPREAD_MIN, SPREAD_STEP } from "@/lib/course/strategy"

const OPTIONS: { value: CompareAgainst; label: string }[] = [
  { value: "handicap", label: "My handicap" },
  { value: "tour", label: "Tour" },
]

/** "Compare against: My handicap / Tour" for the Play planner's strokes. Saved on this device. */
export function PlannerSetting({ spreadSuggestion }: { spreadSuggestion: SpreadSuggestion | null }) {
  // Saved in the browser only, so nothing is highlighted until mount (same as Appearance).
  const [choice, setChoice] = useState<CompareAgainst | null>(null)
  useEffect(() => setChoice(readCompareAgainst()), [])
  const [spread, setSpread] = useState<number | null>(null)
  useEffect(() => setSpread(readSpread()), [])
  const shownSpread = spread ?? ON_COURSE_SPREAD
  const [risk, setRisk] = useState<number | null>(null)
  useEffect(() => setRisk(readRisk()), [])

  function choose(next: CompareAgainst) {
    saveCompareAgainst(next)
    setChoice(next)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <div>
        <p className="label-xs">Planner</p>
        <p className="mt-1 text-xs text-muted">Compare against: strokes to hole out for your handicap, or a PGA TOUR pro</p>
      </div>
      <div role="radiogroup" aria-label="Compare against" className="grid grid-cols-2 gap-1 rounded-lg border border-fg/[0.06] bg-surface-3 p-1">
        {OPTIONS.map(({ value, label }) => {
          const active = choice === value
          return (
            <button
              key={value}
              role="radio"
              aria-checked={active}
              onClick={() => choose(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${active ? "bg-surface text-fg" : "text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="w-full">
        <p className="text-xs text-fg-2">Risk</p>
        <div role="radiogroup" aria-label="Risk" className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-fg/[0.06] bg-surface-3 p-1">
          {RISK_STOPS.map(({ label, strokes }) => (
            <button
              key={label}
              role="radio"
              aria-checked={risk === strokes}
              onClick={() => {
                saveRisk(strokes)
                setRisk(strokes)
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${risk === strokes ? "bg-surface text-fg" : "text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">How much Smart play gives up to avoid out of bounds and water. Conservative plays safer.</p>
      </div>
      <div className="w-full">
        <label htmlFor="on-course-spread" className="flex items-baseline justify-between text-xs text-fg-2">
          <span>On-course spread</span>
          <span className="tabular-nums font-semibold text-fg">{shownSpread.toFixed(2)}x</span>
        </label>
        <input
          id="on-course-spread"
          type="range"
          min={SPREAD_MIN}
          max={SPREAD_MAX}
          step={SPREAD_STEP}
          value={shownSpread}
          onChange={(e) => {
            const v = Number(e.target.value)
            setSpread(v)
            saveSpread(v)
          }}
          className="mt-2 w-full accent-accent"
        />
        <p className="mt-1 text-xs text-muted">
          Range data is tighter than real rounds. Raise this if your misses on the course are wider than the app shows.
        </p>
        {spreadSuggestion && (
          <div className="mt-3 border-t border-fg/[0.06] pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-xs text-fg-2">
                Your on-course spread: <span className="tabular-nums font-semibold text-fg">{spreadSuggestion.ratio.toFixed(2)}x</span> (from {spreadSuggestion.shots} shots)
              </p>
              <button
                onClick={() => {
                  const v = clampSpread(spreadSuggestion.ratio)
                  saveSpread(v)
                  setSpread(v)
                }}
                disabled={shownSpread === clampSpread(spreadSuggestion.ratio)}
                className="h-11 shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-4 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">{spreadSuggestion.groups.map((g) => `${g.label} ${g.ratio.toFixed(2)}x`).join(" · ")}</p>
          </div>
        )}
      </div>
    </div>
  )
}
