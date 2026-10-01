"use client"

// Phones: the club table in a sheet. Collapsed, a chip above the tab bar; open, a
// full-screen list (it covers the map, so every club fits without a scroll fighting
// the map). Picking a club closes it. (Moved verbatim from CourseMapClient.tsx.)

import type { ReactNode } from "react"
import { ChevronDown, X } from "lucide-react"
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
  return (
    <div
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-label={open ? "All clubs" : undefined}
      className={
        open
          ? "fixed inset-0 z-[1200] !mt-0 flex flex-col bg-page pt-[env(safe-area-inset-top)] md:hidden"
          : "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-[1100] flex h-[3.25rem] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-fg/[0.1] bg-surface md:hidden"
      }
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex min-h-[3.25rem] shrink-0 items-center justify-between gap-2 px-4 text-left ${open ? "border-b border-fg/[0.08]" : ""}`}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs tabular-nums">
          <span className="font-semibold text-fg">{chosen?.club ?? "–"}</span>
          <span className="text-muted">·</span>
          <span className="text-fg-3">{chosen ? `${chosen.plan.expectedStrokes.toFixed(2)} strokes` : "–"}</span>
          <span className="text-muted">·</span>
          <span className="text-fg-3">All clubs</span>
        </span>
        {open ? (
          <X size={18} className="shrink-0 text-fg-3" aria-label="Close" />
        ) : (
          <ChevronDown size={16} className="shrink-0 rotate-180 text-fg-3" />
        )}
      </button>
      {open && <div className="flex-1 overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">{children}</div>}
    </div>
  )
}
