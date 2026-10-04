"use client"

const ANSWERS: { value: "left" | "right" | "both" | "none"; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
]

/** Shown on a hole where the map has no out of bounds beside the line: one tap saves the answer for this course and hole. */
export function ObBanner({ onAnswer }: { onAnswer: (a: "left" | "right" | "both" | "none") => void }) {
  return (
    <div className="rounded-xl border border-warn/40 bg-surface px-3 py-2.5 text-xs text-fg-2">
      <p>
        <span className="font-semibold text-fg">No OB mapped on this hole.</span> Is there OB?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ANSWERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onAnswer(value)}
            className="h-11 min-w-16 rounded-lg border border-fg/[0.12] px-3 text-xs font-semibold text-fg hover:bg-fg/[0.04] md:h-9"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
