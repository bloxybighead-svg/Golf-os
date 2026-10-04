"use client"

// The Play planner's header, one row: "H7 · P3 · 108" with the hole arrows. The
// hole numbers never truncate; the course name after them does. Tapping the
// title opens the course/hole sheet, where the full course name lives.

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

export interface HoleHeaderProps {
  /** "H7 · P3 · 108" (or a prompt such as "Find a course"). */
  title: string
  /** Short course name, shown after the title and cut off first when space runs out. */
  courseName?: string
  onOpenPicker: () => void
  showArrows: boolean
  onStep: (dir: 1 | -1) => void
  /** "Hole 8", for the arrows' tooltips. */
  holeLabel: (dir: 1 | -1) => string
}

export function HoleHeader({ title, courseName, onOpenPicker, showArrows, onStep, holeLabel }: HoleHeaderProps) {
  const arrow = "flex h-11 w-11 items-center justify-center rounded-lg border border-fg/[0.08] text-fg-2 transition-colors hover:border-fg/20 hover:text-fg md:h-9 md:w-9"
  return (
    <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 -mx-4 flex h-12 w-[calc(100%+2rem)] items-center gap-2 border-b border-fg/[0.08] bg-page/95 px-4 backdrop-blur-md md:static md:mx-0 md:h-auto md:min-h-[48px] md:w-full md:border-0 md:bg-transparent md:px-0 md:py-1 md:backdrop-blur-none">
      <button type="button" onClick={onOpenPicker} aria-haspopup="dialog" className="flex h-11 min-w-0 flex-1 items-center gap-2 text-left">
        <span className="shrink-0 whitespace-nowrap text-lg font-semibold tracking-tight text-fg tabular-nums">{title}</span>
        {courseName && <span className="min-w-0 truncate text-sm text-muted">{courseName}</span>}
        <ChevronDown size={18} className="shrink-0 text-muted" />
      </button>
      {showArrows && (
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => onStep(-1)} aria-label={`Previous hole (${holeLabel(-1)})`} title={holeLabel(-1)} className={arrow}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => onStep(1)} aria-label={`Next hole (${holeLabel(1)})`} title={holeLabel(1)} className={arrow}>
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
