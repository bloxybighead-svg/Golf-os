"use client"

import { useEffect, type ReactNode } from "react"

/** A short note that removes itself after `ms`: above the dock, or under the hole header on the round screen (`top`). */
export function Toast({ ms, onDone, top = false, children }: { ms: number; onDone: () => void; top?: boolean; children: ReactNode }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms)
    return () => clearTimeout(t)
  }, [ms, onDone])
  return (
    <p
      role="status"
      className={`fixed inset-x-4 z-[1150] mx-auto w-fit max-w-sm rounded-lg border border-fg/[0.12] bg-surface px-3 py-2 text-center text-xs text-fg-2 ${
        top ? "top-[calc(52px+env(safe-area-inset-top)+0.75rem)]" : "bottom-[calc(var(--tab-h)+var(--dock-h)+env(safe-area-inset-bottom)+0.5rem)] md:bottom-6"
      }`}
    >
      {children}
    </p>
  )
}
