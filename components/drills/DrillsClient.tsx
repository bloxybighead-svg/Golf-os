"use client"

import { useState } from "react"
import type { Drill, DrillCategory } from "@/lib/supabase/types"
import { DrillCard } from "./DrillCard"
import { DrillForm } from "./DrillForm"

const ALL_CATEGORIES: (DrillCategory | "All")[] = [
  "All", "Full Swing", "Wedge", "Chipping", "Bunker", "Putting",
]

interface Props {
  drills: Drill[]
  usageCounts: Record<string, number>
}

export function DrillsClient({ drills, usageCounts }: Props) {
  const [activeCategory, setActiveCategory] = useState<DrillCategory | "All">("All")
  const [adding, setAdding] = useState(false)

  if (adding) {
    return <DrillForm onDone={() => setAdding(false)} />
  }

  const visible = activeCategory === "All"
    ? drills
    : drills.filter((d) => d.category === activeCategory)

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Drills</h2>
          <p className="text-xs text-[#6b7280]">{drills.length} in library</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-md bg-[#4ade80] px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          + New Drill
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {ALL_CATEGORIES.map((cat) => {
          const count = cat === "All"
            ? drills.length
            : drills.filter((d) => d.category === cat).length
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                "shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors",
                activeCategory === cat
                  ? "border-[#4ade80] bg-[#4ade80] font-medium text-black"
                  : "border-[#2a2a2a] text-[#6b7280] hover:border-white hover:text-white",
              ].join(" ")}
            >
              {cat}
              {count > 0 && (
                <span className={[
                  "ml-1.5 text-xs",
                  activeCategory === cat ? "text-black/60" : "text-[#6b7280]",
                ].join(" ")}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Drill list */}
      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-[#2a2a2a] py-12 text-center">
          <p className="text-sm text-[#6b7280]">No drills in this category yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((drill) => (
            <DrillCard
              key={drill.id}
              drill={drill}
              usageCount={usageCounts[drill.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
