"use client"

// The Play planner's Layers menu (moved verbatim from CourseMapClient.tsx).

import { createPortal } from "react-dom"
import type { Lie } from "@/lib/course/lies"
import { DRAW_KINDS, LIE_LABEL } from "@/lib/planner/labels"
import { LayerMenuItem } from "./ui"

export interface LayersMenuProps {
  /** Viewport position under the Layers button. */
  pos: { top: number; left: number }
  onClose: () => void
  onMyLocation: () => void
  onToggleFollow: () => void
  following: boolean
  gpsAccuracyYds: number | null
  gpsNote: string
  showTrouble: boolean
  onToggleTrouble: () => void
  showRings: boolean
  onToggleRings: () => void
  showCarry: boolean
  onToggleCarry: () => void
  hasZones: boolean
  showZones: boolean
  onToggleZones: () => void
  drawKind: Lie | null
  onStartDraw: (lie: Lie) => void
}

export function LayersMenu({
  pos,
  onClose,
  onMyLocation,
  onToggleFollow,
  following,
  gpsAccuracyYds,
  gpsNote,
  showTrouble,
  onToggleTrouble,
  showRings,
  onToggleRings,
  showCarry,
  onToggleCarry,
  hasZones,
  showZones,
  onToggleZones,
  drawKind,
  onStartDraw,
}: LayersMenuProps) {
  return createPortal(
      // Rendered through a portal to document.body, not inline: the map sits in its own
      // stacking context (Leaflet's CSS), which made a same-tree dropdown paint underneath it.
      <div
        style={{ top: pos.top, left: pos.left }}
        className="fixed z-[1300] max-h-[70svh] w-56 space-y-0.5 overflow-y-auto rounded-lg border border-fg/[0.1] bg-page p-1.5 shadow-2xl"
      >
        <LayerMenuItem
          onClick={() => {
            onMyLocation()
            onClose()
          }}
          label="My location"
        />
        <LayerMenuItem
          onClick={() => {
            onToggleFollow()
            onClose()
          }}
          active={following}
          label={following ? `Following${gpsAccuracyYds != null ? ` ±${gpsAccuracyYds} yd${gpsNote ? ", weak" : ""}` : "…"}` : "Follow GPS"}
        />
        <LayerMenuItem
          onClick={() => {
            onToggleTrouble()
            onClose()
          }}
          active={showTrouble}
          label="Trouble map"
        />
        <LayerMenuItem
          onClick={() => {
            onToggleRings()
            onClose()
          }}
          active={showRings}
          label="Shot rings"
        />
        <LayerMenuItem
          onClick={() => {
            onToggleCarry()
            onClose()
          }}
          active={showCarry}
          label="Show carry points"
        />
        {hasZones && (
          <LayerMenuItem
            onClick={() => {
              onToggleZones()
              onClose()
            }}
            active={showZones}
            label="My marks"
          />
        )}
        <p className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-muted">Mark an area</p>
        {DRAW_KINDS.map((k) => (
          <LayerMenuItem
            key={k}
            onClick={() => {
              onStartDraw(k)
              onClose()
            }}
            active={drawKind === k}
            label={LIE_LABEL[k]}
          />
        ))}
      </div>,
      document.body
  )
}
