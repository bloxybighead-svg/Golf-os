"use client"

import type { ReactNode } from "react"

/** The shot plan (the result card) as a bottom sheet on the round screen, so the screen never scrolls to show it. */
export function ShotSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <>
      <button type="button" aria-label="Close shot details" onClick={onClose} className="fixed inset-0 z-[1230] bg-black/40" />
      <div
        role="dialog"
        aria-label="Shot details"
        className="fixed inset-x-0 bottom-0 z-[1235] max-h-[80dvh] space-y-3 overflow-y-auto rounded-t-2xl border border-b-0 border-fg/[0.1] bg-page px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
      >
        {children}
      </div>
    </>
  )
}
