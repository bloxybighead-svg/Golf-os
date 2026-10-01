"use client"

// The Play planner's map column: Ball/Aim/Pin toolbar, Layers button, drawing
// banner and floating draw bar, the map itself (passed in), the lie legend and
// the "Your marks" list (moved verbatim from CourseMapClient.tsx).

import type { ReactNode, RefObject } from "react"
import Link from "next/link"
import { Check, ChevronDown, Layers, Loader2, RotateCcw, Undo2, X } from "lucide-react"
import type { LatLng } from "@/lib/course/geo"
import type { Lie, UserZone } from "@/lib/course/lies"
import { LIE_LABEL, LIES } from "@/lib/planner/labels"
import { cssColor } from "@/lib/theme/tokens"
import { lieColor, type Placing } from "@/components/simulator/courseColors"
import { ToolButton } from "./ui"

export interface MapViewProps {
  placing: Placing
  onPlacingChange: (p: Placing) => void
  drawKind: Lie | null
  pendingPoints: LatLng[]
  aimIsManual: boolean
  onResetAim: () => void
  layersRef: RefObject<HTMLDivElement>
  layersActive: boolean
  onLayersClick: () => void
  layersMenu: ReactNode
  gpsError: string
  gpsNote: string
  onUndoDraw: () => void
  onFinishDraw: () => void
  onCancelDraw: () => void
  mapWrapRef: RefObject<HTMLDivElement>
  /** The map (or the "Find a course" placeholder). */
  mapContent: ReactNode
  planReady: boolean
  showTrouble: boolean
  zones: UserZone[]
  localOnlyZones: UserZone[] | null
  showMarks: boolean
  onToggleMarks: () => void
  onSyncZones: () => void
  syncingZones: boolean
  onDismissLocalZones: () => void
  signedIn: boolean
  onDeleteZone: (id: string) => void
}

export function MapView({
  placing,
  onPlacingChange,
  drawKind,
  pendingPoints,
  aimIsManual,
  onResetAim,
  layersRef,
  layersActive,
  onLayersClick,
  layersMenu,
  gpsError,
  gpsNote,
  onUndoDraw,
  onFinishDraw,
  onCancelDraw,
  mapWrapRef,
  mapContent,
  planReady,
  showTrouble,
  zones,
  localOnlyZones,
  showMarks,
  onToggleMarks,
  onSyncZones,
  syncingZones,
  onDismissLocalZones,
  signedIn,
  onDeleteZone,
}: MapViewProps) {
  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex items-center gap-2 text-xs">
        <div role="group" aria-label="What a tap on the map moves" className="flex shrink-0 overflow-hidden rounded-lg border border-fg/[0.08]">
          {(["ball", "aim", "pin"] as Placing[]).map((p) => (
            <button
              key={p}
              onClick={() => onPlacingChange(p)}
              disabled={!!drawKind}
              aria-pressed={placing === p}
              title={`Tap the map to move the ${p}`}
              className={`h-11 px-4 font-medium capitalize disabled:opacity-30 md:h-9 ${
                placing === p ? "bg-accent text-on-accent" : "bg-surface text-fg-3 hover:text-fg"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {aimIsManual && (
            <ToolButton
              onClick={onResetAim}
              icon={RotateCcw}
              label="Reset aim"
            />
          )}
          <div ref={layersRef}>
            <ToolButton
              onClick={onLayersClick}
              icon={Layers}
              active={layersActive}
              label="Layers"
            />
          </div>
        </div>
      </div>
      {layersMenu}
      {gpsError && <p className="text-xs text-danger">{gpsError}</p>}
      {gpsNote && !gpsError && <p className="text-xs text-warn" role="status">{gpsNote}</p>}

      {drawKind && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: lieColor(drawKind, 0.33), backgroundColor: lieColor(drawKind, 0.08) }}
        >
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: lieColor(drawKind) }} />
          <span className="text-fg-2">
            Tap the map to outline the <strong>{LIE_LABEL[drawKind].toLowerCase()}</strong> area
            {pendingPoints.length > 0 ? ` · ${pendingPoints.length} point${pendingPoints.length === 1 ? "" : "s"}` : ""}.
            {pendingPoints.length >= 3 && " Tap the first (bigger) point again to close it."}
          </span>
          {/* Duplicated as a floating bar over the map on phones (below), so this row is desktop/tablet only. */}
          <div className="ml-auto hidden shrink-0 items-center gap-1.5 md:flex">
            <button
              onClick={onUndoDraw}
              disabled={pendingPoints.length === 0}
              className="flex items-center gap-1 rounded-md border border-fg/[0.15] px-2 py-1 font-medium text-fg-2 hover:text-fg disabled:opacity-30"
            >
              <Undo2 size={12} /> Undo
            </button>
            <button
              onClick={onFinishDraw}
              disabled={pendingPoints.length < 3}
              className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 font-semibold text-on-accent disabled:opacity-30"
            >
              <Check size={12} /> Finish
            </button>
            <button onClick={onCancelDraw} className="flex items-center gap-1 rounded-md border border-fg/[0.15] px-2 py-1 font-medium text-fg-2 hover:text-fg">
              <X size={12} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div
        ref={mapWrapRef}
        className="relative isolate h-[60svh] min-h-[380px] overflow-hidden rounded-2xl border border-fg/[0.07] bg-page md:h-[70vh] md:min-h-[460px]"
      >
        {mapContent}
        {/* Drawing controls, pinned over the map so a thumb never has to leave it to tap Finish. */}
        {drawKind && (
          <div className="absolute bottom-3 left-2 right-2 z-[1100] flex items-center justify-center gap-2 md:hidden">
            <button
              onClick={onUndoDraw}
              disabled={pendingPoints.length === 0}
              className="flex h-11 items-center gap-1 rounded-full border border-white/25 bg-black/80 px-4 text-xs font-medium text-white backdrop-blur-sm disabled:opacity-30"
            >
              <Undo2 size={13} /> Undo
            </button>
            <button
              onClick={onFinishDraw}
              disabled={pendingPoints.length < 3}
              className="flex h-11 items-center gap-1 rounded-full bg-accent px-5 text-xs font-semibold text-on-accent disabled:opacity-30"
            >
              <Check size={13} /> Finish
            </button>
            <button onClick={onCancelDraw} className="flex h-11 items-center gap-1 rounded-full border border-white/25 bg-black/80 px-4 text-xs font-medium text-white backdrop-blur-sm">
              <X size={13} /> Cancel
            </button>
          </div>
        )}
      </div>

      {planReady && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-fg-3">
          {LIES.map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-black/60" style={{ background: lieColor(l) }} />
              {LIE_LABEL[l]}
            </span>
          ))}
          {showTrouble && (
            <span className="flex items-center gap-1.5 text-fg-2">
              <span
                className="inline-block h-2.5 w-14 rounded-full"
                style={{ background: `linear-gradient(90deg, ${cssColor("map-better")}, ${cssColor("map-marker", 0.2)}, ${cssColor("map-caution")}, ${cssColor("map-worse")})` }}
              />
              better ← vs fairway → worse
            </span>
          )}
        </div>
      )}

      {(zones.length > 0 || (localOnlyZones?.length ?? 0) > 0) && (
        <div className="text-xs">
          <button
            type="button"
            onClick={onToggleMarks}
            aria-expanded={showMarks}
            className="flex min-h-[44px] items-center gap-1.5 text-fg-3 hover:text-fg md:min-h-0"
          >
            Your marks · <span className="tabular-nums">{zones.length}</span>
            <ChevronDown size={14} className={`transition-transform ${showMarks ? "rotate-180" : ""}`} />
          </button>
          {showMarks && (
            <div className="mt-1.5 space-y-2">
              {localOnlyZones && localOnlyZones.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-2 text-fg-2">
                  <span>
                    {localOnlyZones.length} mark{localOnlyZones.length === 1 ? "" : "s"} saved on this device only.
                  </span>
                  <button
                    onClick={onSyncZones}
                    disabled={syncingZones}
                    className="ml-auto flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 font-semibold text-on-accent disabled:opacity-50"
                  >
                    {syncingZones ? <Loader2 size={12} className="animate-spin" /> : null}
                    {syncingZones ? "Saving…" : "Save to my account"}
                  </button>
                  <button onClick={onDismissLocalZones} className="shrink-0 text-muted hover:text-fg">
                    Not now
                  </button>
                </div>
              )}
              {zones.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {!signedIn && (
                    <span className="text-muted">
                      On this device only.{" "}
                      <Link href="/login" className="text-accent hover:underline">
                        Sign in to sync
                      </Link>
                    </span>
                  )}
                  {zones.map((z) => (
                    <span
                      key={z.id}
                      className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-fg-2"
                      style={{ borderColor: lieColor(z.lie, 0.44) }}
                    >
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: lieColor(z.lie) }} />
                      {LIE_LABEL[z.lie]}
                      <button
                        onClick={() => onDeleteZone(z.id)}
                        aria-label={`Remove marked ${LIE_LABEL[z.lie]} area`}
                        className="text-muted hover:text-danger"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
