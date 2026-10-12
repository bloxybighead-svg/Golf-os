// The round screen's dock: exactly two rows under the map. Row 1 is Smart play and Go for it (two lines each),
// then "Hole done" and the shot-details button; row 2 the club chips with "All clubs" pinned right. Sideways, the
// same two rows become a column beside the map.

import type { ReactNode } from "react"
import { ChevronUp } from "lucide-react"
import { DOCK_ROW_CLASS } from "@/lib/planner/dock"

export function RoundDock({
  plays,
  chips,
  onDetails,
  onHoleDone,
}: {
  plays: ReactNode
  chips: ReactNode
  onDetails: (() => void) | null
  onHoleDone: () => void
}) {
  return (
    <div className="border-t border-fg/[0.1] bg-surface landscape:flex landscape:flex-col landscape:justify-center landscape:border-l landscape:border-t-0">
      {/* Sideways the two cards stack: two card rows and their gap. */}
      <div data-dock-row="plays" className={`${DOCK_ROW_CLASS.plays} flex shrink-0 items-center gap-2 overflow-hidden px-3 landscape:h-[8.5rem]`}>
        <div className="min-w-0 flex-1 landscape:h-full">{plays}</div>
        <button
          type="button"
          onClick={onHoleDone}
          className="h-11 shrink-0 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent transition-all hover:brightness-110"
        >
          Hole done
        </button>
        {onDetails && (
          <button type="button" onClick={onDetails} aria-label="Shot details" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:text-fg">
            <ChevronUp size={20} />
          </button>
        )}
      </div>
      <div data-dock-row="chips" className={`${DOCK_ROW_CLASS.chips} flex shrink-0 items-center gap-2 overflow-hidden px-3`}>
        {chips}
      </div>
    </div>
  )
}
