"use client"

import { useState, useRef, useEffect } from "react"
import type { Drill } from "@/lib/supabase/types"

interface Props {
  drills: Drill[]
  drillId: string | null
  freeText: string
  onChange: (drillId: string | null, freeText: string) => void
}

export function DrillCombobox({ drills, drillId, freeText, onChange }: Props) {
  const selectedDrill = drills.find((d) => d.id === drillId)
  const [query, setQuery] = useState(selectedDrill?.name ?? freeText)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered =
    query.length > 0
      ? drills.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
      : drills

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const select = (drill: Drill) => {
    setQuery(drill.name)
    onChange(drill.id, "")
    setOpen(false)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    onChange(null, val)
    setOpen(true)
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        placeholder="Search drills or type your own…"
        className="w-full rounded-md border border-line bg-surface-4 px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-line bg-surface-4 shadow-xl">
          {filtered.map((drill) => (
            <button
              key={drill.id}
              type="button"
              onMouseDown={() => select(drill)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-surface-4"
            >
              <span className="text-sm text-fg">{drill.name}</span>
              <span className="ml-3 shrink-0 text-xs text-muted">{drill.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
