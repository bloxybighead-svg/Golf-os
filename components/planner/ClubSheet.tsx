"use client"

// Phones: the full club table as a full-screen sheet (it covers the map, so every
// club fits without a scroll fighting the map). Opened from the dock's "All clubs"
// button; picking a club closes it. The closed state is the dock (PlannerView).

import type { ReactNode } from "react"
import { X } from "lucide-react"
import type { OptimizedClubPlan } from "@/lib/course/plan"

export function ClubSheet({
  open,
  onToggle,
  chosen,
  children,
}: {
  open: boolean
  onToggle: () => void
  chosen: OptimizedClubPlan | null
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div role="dialog" aria-modal="true" aria-label="All clubs" className="fixed inset-0 z-[1200] !mt-0 flex flex-col bg-page pt-[env(safe-area-inset-top)] md:hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded
        className="flex min-h-[3.25rem] shrink-0 items-center justify-between gap-2 border-b border-fg/[0.08] px-4 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs tabular-nums">
          <span className="font-semibold text-fg">{chosen?.club ?? "–"}</span>
          <span className="text-muted">·</span>
          <span className="text-fg-3">{chosen ? `${chosen.plan.expectedStrokes.toFixed(2)} strokes` : "–"}</span>
          <span className="text-muted">·</span>
          <span className="text-fg-3">All clubs</span>
        </span>
        <X size={18} className="shrink-0 text-fg-3" aria-label="Close" />
      </button>
      <div className="flex-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">{children}</div>
    </div>
  )
}
