"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Info } from "lucide-react"

const MAX_WIDTH = 288
const GUTTER = 16

// "How is this worked out?" behind a tap, instead of permanent body text under
// the number. Opens a small popover; an outside tap or Escape closes it.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Measured on open: how far to shift the popover (from the icon's left edge)
  // and how wide it can be, so it always sits inside the screen's side gutters.
  const [place, setPlace] = useState({ left: 0, width: MAX_WIDTH })
  const ref = useRef<HTMLSpanElement>(null)

  function toggle() {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect()
      const width = Math.min(MAX_WIDTH, window.innerWidth - GUTTER * 2)
      const screenLeft = Math.min(Math.max(r.left, GUTTER), window.innerWidth - GUTTER - width)
      setPlace({ left: screenLeft - r.left, width })
    }
    setOpen((v) => !v)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className="-m-3 flex h-11 w-11 items-center justify-center text-muted transition-colors hover:text-fg md:-m-2 md:h-8 md:w-8"
      >
        <Info size={14} />
      </button>
      {open && (
        <span
          role="note"
          style={{ left: place.left, width: place.width }}
          className="absolute top-full z-30 mt-1 block rounded-lg border border-fg/[0.1] bg-page p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-fg-2 shadow-2xl"
        >
          {children}
        </span>
      )}
    </span>
  )
}
