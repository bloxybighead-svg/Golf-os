"use client"

import { useEffect, type ReactNode } from "react"

/** A short note above the dock that removes itself after `ms`. */
export function Toast({ ms, onDone, children }: { ms: number; onDone: () => void; children: ReactNode }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms)
    return () => clearTimeout(t)
  }, [ms, onDone])
  return (
    <p
      role="status"
      className="fixed inset-x-4 bottom-[calc(var(--tab-h)+var(--dock-h)+env(safe-area-inset-bottom)+0.5rem)] z-[1150] mx-auto w-fit max-w-sm rounded-lg border border-fg/[0.12] bg-surface px-3 py-2 text-center text-xs text-fg-2 md:bottom-6"
    >
      {children}
    </p>
  )
}
