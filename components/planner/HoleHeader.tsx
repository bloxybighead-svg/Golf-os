"use client"

// The Play planner's title line: "Pebble Beach · Hole 7 · Par 3 · 108" (opens the
// course/hole sheet) plus previous/next hole (moved verbatim from CourseMapClient.tsx).

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

export interface HoleHeaderProps {
  title: string
  onOpenPicker: () => void
  showArrows: boolean
  onStep: (dir: 1 | -1) => void
  /** "Hole 8", for the arrows' tooltips. */
  holeLabel: (dir: 1 | -1) => string
}

export function HoleHeader({ title, onOpenPicker, showArrows, onStep, holeLabel }: HoleHeaderProps) {
  return (
    <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 -mx-4 flex w-[calc(100%+2rem)] min-h-[48px] items-center gap-2 border-b border-fg/[0.08] bg-page/95 px-4 py-1 backdrop-blur-md md:static md:mx-0 md:w-full md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
      <button
        type="button"
        onClick={onOpenPicker}
        aria-haspopup="dialog"
        className="flex min-h-[44px] min-w-0 items-center gap-1.5 text-left"
      >
        <span className="min-w-0 truncate text-lg font-semibold tracking-tight text-fg tabular-nums">
          {title}
        </span>
        <ChevronDown size={18} className="shrink-0 text-muted" />
      </button>
      {showArrows && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onStep(-1)}
            aria-label={`Previous hole (${holeLabel(-1)})`}
            title={holeLabel(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-fg/[0.08] text-fg-2 transition-colors hover:border-fg/20 hover:text-fg md:h-9 md:w-9"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => onStep(1)}
            aria-label={`Next hole (${holeLabel(1)})`}
            title={holeLabel(1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-fg/[0.08] text-fg-2 transition-colors hover:border-fg/20 hover:text-fg md:h-9 md:w-9"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
