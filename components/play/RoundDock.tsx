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
  shot,
}: {
  plays: ReactNode
  chips: ReactNode
  onDetails: (() => void) | null
  onHoleDone: () => void
  /** "Track every shot": a large Shot button at the start of the club row. Null when tracking is off. */
  shot: { club: string | null; onTap: () => void; disabled: boolean } | null
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
        {shot && (
          <button
            type="button"
            onClick={shot.onTap}
            disabled={shot.disabled}
            aria-label={shot.club ? `Shot with ${shot.club}` : "Shot"}
            className="flex h-11 min-w-[88px] shrink-0 flex-col items-center justify-center rounded-lg bg-accent px-4 leading-tight text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
          >
            <span className="text-base font-semibold">Shot</span>
            {shot.club && <span className="max-w-[72px] truncate text-[10px]">{shot.club}</span>}
          </button>
        )}
        {chips}
      </div>
    </div>
  )
}
