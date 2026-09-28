"use client"

import type { Tendency, TendencySide, TendencyStrength } from "@/lib/golfer/build"

const SIDES: { value: TendencySide; label: string }[] = [
  { value: "auto", label: "Not sure (use handicap average)" },
  { value: "straight", label: "Pretty straight" },
  { value: "left", label: "Miss left (pull / hook)" },
  { value: "right", label: "Miss right (push / slice)" },
  { value: "both", label: "Miss both ways" },
]

const STRENGTHS: { value: TendencyStrength; label: string }[] = [
  { value: "slight", label: "Slight" },
  { value: "moderate", label: "Moderate" },
  { value: "strong", label: "Strong" },
]

const selectClass = "rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"

export function TendencyPicker({ value, onChange }: { value: Tendency; onChange: (t: Tendency) => void }) {
  const needsStrength = value.side === "left" || value.side === "right" || value.side === "both"
  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Miss tendency</span>
        <select value={value.side} onChange={(e) => onChange({ ...value, side: e.target.value as TendencySide })} className={selectClass}>
          {SIDES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {needsStrength && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">How much</span>
          <select
            value={value.strength}
            onChange={(e) => onChange({ ...value, strength: e.target.value as TendencyStrength })}
            className={selectClass}
          >
            {STRENGTHS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}
