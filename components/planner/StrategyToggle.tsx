"use client"

import type { Strategy } from "@/lib/course/strategy"

const OPTIONS: { value: Strategy; label: string }[] = [
  { value: "par", label: "Par" },
  { value: "go", label: "Go for it" },
]

/** Par (default: penalty risk counts) or Go for it (pure expected strokes). Resets to Par on every new hole. */
export function StrategyToggle({ strategy, onChange }: { strategy: Strategy; onChange: (s: Strategy) => void }) {
  return (
    <div role="radiogroup" aria-label="Strategy" className="inline-grid grid-cols-2 gap-0.5 rounded-lg border border-fg/[0.08] bg-surface-3 p-0.5">
      {OPTIONS.map(({ value, label }) => {
        const active = strategy === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(value)}
            className={`h-9 rounded-md px-3 text-xs font-semibold transition-colors ${active ? "bg-surface text-fg" : "text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
