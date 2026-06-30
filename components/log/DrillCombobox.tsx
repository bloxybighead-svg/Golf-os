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
        className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-[#2a2a2a] bg-[#1e1e1e] shadow-xl">
          {filtered.map((drill) => (
            <button
              key={drill.id}
              type="button"
              onMouseDown={() => select(drill)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-[#262626]"
            >
              <span className="text-sm text-white">{drill.name}</span>
              <span className="ml-3 shrink-0 text-xs text-[#6b7280]">{drill.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
