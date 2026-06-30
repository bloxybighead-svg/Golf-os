"use client"

import { useState } from "react"
import { BookOpen } from "lucide-react"
import type { Drill, DrillCategory } from "@/lib/supabase/types"
import { DrillCard } from "./DrillCard"
import { DrillForm } from "./DrillForm"

const ALL_CATEGORIES: (DrillCategory | "All")[] = [
  "All", "Full Swing", "Wedge", "Chipping", "Bunker", "Putting", "Mental",
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
    <div className="mx-auto max-w-lg space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Drills</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">{drills.length} in library</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-semibold text-black shadow-md shadow-[#22c55e]/20 transition-all hover:brightness-110 hover:scale-[1.03] active:scale-[0.97]"
        >
          <span className="text-base leading-none">+</span>
          <span>New Drill</span>
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {ALL_CATEGORIES.map((cat) => {
          const count = cat === "All"
            ? drills.length
            : drills.filter((d) => d.category === cat).length
          const active = activeCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                "shrink-0 rounded-lg border px-3 py-1.5 text-sm transition-all",
                active
                  ? "border-[#22c55e] bg-[#22c55e] font-semibold text-black"
                  : "border-white/[0.06] bg-[#111111] text-[#6b7280] hover:text-white hover:border-white/20",
              ].join(" ")}
            >
              {cat}
              {count > 0 && (
                <span className={["ml-1.5 text-xs", active ? "text-black/60" : "text-[#4b5563]"].join(" ")}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Empty state */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] py-14 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#1a1a1a]">
            <BookOpen size={18} className="text-[#22c55e]" />
          </div>
          <p className="text-sm font-medium text-white">No drills in this category</p>
          <p className="mt-1 text-xs text-[#6b7280]">Add one with the button above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((drill) => (
            <DrillCard key={drill.id} drill={drill} usageCount={usageCounts[drill.id] ?? 0} />
          ))}
        </div>
      )}
    </div>
  )
}
