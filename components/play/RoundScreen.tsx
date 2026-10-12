// The round screen on phones: one full-viewport grid whose rows add up to the screen, so nothing is
// positioned by guesswork. Portrait: hole header, map (the rest), dock (its own height, plus the bottom safe area).
// Sideways: the map takes the left, the dock is a column on the right.
// Row: header 52px.

import type { ReactNode } from "react"

export function RoundScreen({
  header,
  map,
  dock,
  round,
}: {
  header: ReactNode
  map: ReactNode
  dock: ReactNode
  /** The round's toasts and sheets: nothing in the grid, everything on top of it. */
  round: ReactNode
}) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-40 grid h-[100dvh] grid-cols-[minmax(0,1fr)] grid-rows-[52px_minmax(0,1fr)_auto] bg-page pt-[env(safe-area-inset-top)] landscape:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] landscape:grid-rows-[52px_minmax(0,1fr)]"
      data-round-screen
    >
      <div className="relative z-30 landscape:col-span-2">{header}</div>
      <div className="relative min-h-0 [--map-inset:0.75rem]">{map}</div>
      <div className="min-w-0 pb-[env(safe-area-inset-bottom)] landscape:pb-0">{dock}</div>
      {round}
    </div>
  )
}
