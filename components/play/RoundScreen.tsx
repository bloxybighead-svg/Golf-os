// The round screen on phones: one full-viewport grid whose rows add up to the screen, so nothing is
// positioned by guesswork. Portrait: hole header, map (the rest), dock (its own height), round bar.
// Sideways: the map takes the left, the dock is a column on the right, the bar stays at the bottom.
// Scoring swaps the map and dock for the score pad, which gets their space.
// Rows: header 52px, bar 56px (the tab bar's height) plus the bottom safe area.

import type { ReactNode } from "react"

export function RoundScreen({
  scoring,
  header,
  map,
  dock,
  score,
  bar,
}: {
  scoring: boolean
  header: ReactNode
  map: ReactNode
  dock: ReactNode
  /** Always rendered: it holds the offline toast, and the score pad while scoring. */
  score: ReactNode
  bar: ReactNode
}) {
  return (
    <div
      className="fixed inset-x-0 top-0 z-40 grid h-[100dvh] grid-cols-[minmax(0,1fr)] grid-rows-[52px_minmax(0,1fr)_auto_calc(56px+env(safe-area-inset-bottom))] bg-page pt-[env(safe-area-inset-top)] landscape:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] landscape:grid-rows-[52px_minmax(0,1fr)_calc(56px+env(safe-area-inset-bottom))]"
      data-round-screen
    >
      <div className="relative z-30 landscape:col-span-2">{header}</div>
      {/* Kept mounted while scoring (hidden, not removed), so the map comes back as it was. */}
      <div className={scoring ? "hidden" : "relative min-h-0 [--map-inset:0.75rem]"}>{map}</div>
      <div className={scoring ? "hidden" : "min-w-0"}>{dock}</div>
      <div className={scoring ? "row-span-2 min-h-0 overflow-y-auto px-4 py-4 landscape:col-span-2 landscape:row-span-1" : "contents"}>{score}</div>
      {bar}
    </div>
  )
}
