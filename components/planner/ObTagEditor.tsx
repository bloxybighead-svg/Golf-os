"use client"

import type { ObSide, ObTag } from "@/lib/course/obTags"
import { OB_MARGIN_MAX_YDS, OB_MARGIN_MIN_YDS, OB_MARGIN_YDS } from "@/lib/course/strategy"

const SIDES: { side: ObSide; label: string }[] = [
  { side: "left", label: "OB left" },
  { side: "right", label: "OB right" },
  { side: "long", label: "OB long" },
]
const MARGIN_STEP = 5

/** Quick OB tags for a hole (as you face the green from the tee), plus how far past the fairway edge the stakes are. Applied at once, for you only. */
export function ObTagEditor({
  tags,
  onToggle,
  onMargin,
}: {
  tags: ObTag[]
  onToggle: (side: ObSide) => void
  onMargin: (yds: number) => void
}) {
  const active = tags.filter((t) => t.side !== "none")
  const margin = active[0]?.marginYds ?? OB_MARGIN_YDS
  return (
    <div className="rounded-lg border border-fg/[0.08] p-3">
      <p className="text-xs font-medium text-fg-3">Out of bounds on this hole</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SIDES.map(({ side, label }) => {
          const on = tags.some((t) => t.side === side)
          return (
            <button
              key={side}
              aria-pressed={on}
              onClick={() => onToggle(side)}
              className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-colors ${
                on ? "border-danger/60 bg-danger/10 text-danger" : "border-fg/[0.1] text-fg-3 hover:text-fg"
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {active.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-fg-3">
          <span>Stakes</span>
          <button
            aria-label="Stakes closer"
            disabled={margin <= OB_MARGIN_MIN_YDS}
            onClick={() => onMargin(margin - MARGIN_STEP)}
            className="h-8 w-8 rounded-md border border-fg/[0.1] text-fg disabled:opacity-40"
          >
            −
          </button>
          <span className="w-12 text-center font-semibold tabular-nums text-fg">{margin} yd</span>
          <button
            aria-label="Stakes farther"
            disabled={margin >= OB_MARGIN_MAX_YDS}
            onClick={() => onMargin(margin + MARGIN_STEP)}
            className="h-8 w-8 rounded-md border border-fg/[0.1] text-fg disabled:opacity-40"
          >
            +
          </button>
          <span>past the fairway edge</span>
        </div>
      )}
    </div>
  )
}
