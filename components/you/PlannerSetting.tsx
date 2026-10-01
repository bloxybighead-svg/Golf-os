"use client"

import { useEffect, useState } from "react"
import { readCompareAgainst, saveCompareAgainst, type CompareAgainst } from "@/lib/course/baseline"

const OPTIONS: { value: CompareAgainst; label: string }[] = [
  { value: "handicap", label: "My handicap" },
  { value: "tour", label: "Tour" },
]

/** "Compare against: My handicap / Tour" for the Play planner's strokes. Saved on this device. */
export function PlannerSetting() {
  // Saved in the browser only, so nothing is highlighted until mount (same as Appearance).
  const [choice, setChoice] = useState<CompareAgainst | null>(null)
  useEffect(() => setChoice(readCompareAgainst()), [])

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
    </div>
  )
}
