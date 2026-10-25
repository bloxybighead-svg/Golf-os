// The phone Play dock: three fixed rows above the tab bar. The map takes the
// height that is left, worked out from these numbers (never a guess).

import type { CSSProperties } from "react"

/** Row heights in px. The Tailwind class for each is in DOCK_ROW_CLASS (4 px per unit). `round` is the round screen's one-row dock. */
export const DOCK_ROW_PX = { status: 40, plays: 64, chips: 44, round: 56 } as const
export const DOCK_ROW_CLASS = { status: "h-10", plays: "h-16", chips: "h-11", round: "h-14" } as const

const DOCK_BORDER_PX = 1
export const DOCK_HEIGHT_PX = DOCK_ROW_PX.status + DOCK_ROW_PX.plays + DOCK_ROW_PX.chips + DOCK_BORDER_PX

export const TAB_BAR_PX = 56
const HOLE_HEADER_PX = 48
const GAP_PX = 12

/** Set on the Play page: --dock-h and --tab-h place the dock and toasts, --map-h is the map's height on phones. --resume-h (globals.css) is the slim "Round in progress" bar when it is showing above the tab bar. */
export const dockCssVars = {
  "--dock-h": `${DOCK_HEIGHT_PX}px`,
  "--tab-h": `calc(${TAB_BAR_PX}px + var(--resume-h, 0px))`,
  "--map-h": `calc(100dvh - ${HOLE_HEADER_PX + GAP_PX + DOCK_HEIGHT_PX + TAB_BAR_PX}px - var(--resume-h, 0px) - env(safe-area-inset-top) - env(safe-area-inset-bottom))`,
} as CSSProperties
