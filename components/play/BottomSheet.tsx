"use client"

import { useEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

/** A bottom sheet on phones, a centred panel on tablets and desktops: a title row, a scrolling body, an optional footer. Escape or a tap outside closes it. */
export function BottomSheet({
  label,
  title,
  onClose,
  footer,
  children,
}: {
  label: string
  title: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 md:items-start md:p-4 md:pt-16" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-fg/[0.08] bg-page pb-[env(safe-area-inset-bottom)] md:max-w-md md:rounded-2xl md:pb-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-fg/[0.08] py-2 pl-4 pr-2">
          <p className="min-w-0 truncate text-sm font-semibold text-fg">{title}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-fg/[0.06] hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="shrink-0 space-y-2 border-t border-fg/[0.08] px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
