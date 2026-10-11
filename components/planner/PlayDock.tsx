// The Play dock. Phones, map showing: three fixed rows above the tab bar, so the map above never changes
// size. Tablets and desktops (md) and scoring put the same content back in the page.

import type { ReactNode } from "react"
import { DOCK_ROW_CLASS } from "@/lib/planner/dock"

export function PlayDock({ scoring, status, plays, chips }: { scoring: boolean; status: ReactNode; plays: ReactNode; chips: ReactNode }) {
  return (
    <div
      className={
        scoring
          ? "space-y-3"
          : "fixed inset-x-0 bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom))] z-[1100] rounded-t-2xl border border-b-0 border-fg/[0.1] bg-surface px-4 md:static md:z-auto md:space-y-3 md:rounded-none md:border-0 md:bg-transparent md:px-0"
      }
    >
      <div
        data-dock-row="status"
        className={
          scoring
            ? "space-y-3"
            : `${DOCK_ROW_CLASS.status} flex shrink-0 items-center justify-between gap-2 overflow-hidden md:h-auto md:flex-wrap md:justify-start md:gap-3 md:overflow-visible`
        }
      >
        {status}
      </div>
      {!scoring && (
        <>
          <div data-dock-row="plays" className={`${DOCK_ROW_CLASS.plays} shrink-0 overflow-hidden md:hidden`}>
            {plays}
          </div>
          <div data-dock-row="chips" className={`${DOCK_ROW_CLASS.chips} flex shrink-0 items-center gap-2 overflow-hidden md:hidden`}>
            {chips}
          </div>
        </>
      )}
    </div>
  )
}
