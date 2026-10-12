"use client"

import { ClipboardList, Map as MapIcon } from "lucide-react"
import type { PlayView } from "@/components/play/PlayRound"

const ITEMS = [
  { view: "map", label: "Map", Icon: MapIcon },
  { view: "score", label: "Score", Icon: ClipboardList },
] as const

/**
 * Map | Score. "bar" is the round screen's bottom bar, built like the tab bar it replaces (same
 * height, same item style). "segmented" is the small switch for the dock and the desktop sidebar.
 * Once a hole is scored the Score item shows the score to par ("+2") in place of its name.
 */
export function RoundBar({
  view,
  onViewChange,
  scoreLabel,
  variant,
}: {
  view: PlayView
  onViewChange: (view: PlayView) => void
  scoreLabel: string | null
  variant: "bar" | "segmented"
}) {
  const bar = variant === "bar"
  return (
    <div
      role="tablist"
      aria-label="Round"
      className={
        bar
          ? "grid grid-cols-2 border-t border-fg/[0.08] bg-page pb-[env(safe-area-inset-bottom)] landscape:col-span-2"
          : "flex shrink-0 overflow-hidden rounded-lg border border-fg/[0.08]"
      }
    >
      {ITEMS.map(({ view: v, label, Icon }) => {
        const active = view === v
        const text = v === "score" && scoreLabel ? scoreLabel : label
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            aria-label={label}
            onClick={() => onViewChange(v)}
            className={
              bar
                ? `flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium tabular-nums transition-colors ${active ? "text-accent" : "text-muted"}`
                : `h-10 px-5 text-sm font-semibold tabular-nums ${active ? "bg-accent text-on-accent" : "bg-surface text-fg-3 hover:text-fg"}`
            }
          >
            {bar && <Icon strokeWidth={active ? 2.4 : 1.8} className="h-5 w-5" />}
            {text}
          </button>
        )
      })}
    </div>
  )
}
