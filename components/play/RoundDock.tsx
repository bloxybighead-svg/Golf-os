// The round screen's dock: one row under the map. The chosen club with its risk, the Smart | Go switch, then
// "Hole done". Tapping the club opens the expanded dock (ShotSheet: club chips, Shot button, result card).
// Sideways, the row becomes a column beside the map.

import type { ReactNode } from "react"
import { DOCK_ROW_CLASS } from "@/lib/planner/dock"

export function RoundDock({ plays, onHoleDone }: { plays: ReactNode; onHoleDone: () => void }) {
  return (
    <div className="border-t border-fg/[0.1] bg-surface landscape:flex landscape:flex-col landscape:justify-center landscape:border-l landscape:border-t-0">
      <div data-dock-row="round" className={`${DOCK_ROW_CLASS.round} flex shrink-0 items-center gap-2 overflow-hidden px-3 landscape:h-auto landscape:flex-col landscape:items-stretch landscape:overflow-visible landscape:py-3`}>
        <div className="min-w-0 flex-1 landscape:flex-none">{plays}</div>
        <button
          type="button"
          onClick={onHoleDone}
          className="h-11 shrink-0 rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent transition-all hover:brightness-110"
        >
          Hole done
        </button>
      </div>
    </div>
  )
}
