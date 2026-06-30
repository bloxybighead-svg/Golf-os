"use client"

import { useState, useTransition } from "react"
import type { Drill, DrillCategory } from "@/lib/supabase/types"
import { createDrill, updateDrill } from "@/app/drills/actions"

const CATEGORIES: DrillCategory[] = ["Full Swing", "Wedge", "Chipping", "Bunker", "Putting"]

interface Props {
  drill?: Drill
  onDone: () => void
}

export function DrillForm({ drill, onDone }: Props) {
  const [name, setName] = useState(drill?.name ?? "")
  const [category, setCategory] = useState<DrillCategory>(drill?.category ?? "Full Swing")
  const [description, setDescription] = useState(drill?.description ?? "")
  const [targetMetric, setTargetMetric] = useState(drill?.target_metric ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!name.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        const data = {
          name: name.trim(),
          category,
          description: description.trim(),
          target_metric: targetMetric.trim(),
        }
        if (drill) {
          await updateDrill(drill.id, data)
        } else {
          await createDrill(data)
        }
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f0f0f]">
      <div className="flex shrink-0 items-center justify-between border-b border-[#2a2a2a] px-4 py-3">
        <button type="button" onClick={onDone} className="text-sm text-[#6b7280] hover:text-white transition-colors">
          Cancel
        </button>
        <span className="text-sm font-semibold text-white">
          {drill ? "Edit Drill" : "New Drill"}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || isPending}
          className="text-sm font-semibold text-[#4ade80] hover:opacity-80 disabled:opacity-30 transition-opacity"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Name */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
            Drill Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Stockton Clock Drill"
            className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
          />
        </div>

        {/* Category */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[#6b7280]">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  category === c
                    ? "border-[#4ade80] bg-[#4ade80] text-black"
                    : "border-[#2a2a2a] text-[#6b7280] hover:border-white hover:text-white",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What do you do in this drill?"
            rows={3}
            className="w-full resize-none rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
          />
        </div>

        {/* Target metric */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#6b7280]">
            Success Looks Like
          </label>
          <input
            type="text"
            value={targetMetric}
            onChange={(e) => setTargetMetric(e.target.value)}
            placeholder="e.g. All 12 in a row, within 3 feet"
            className="w-full rounded-md border border-[#2a2a2a] bg-[#1e1e1e] px-3 py-2.5 text-sm text-white placeholder:text-[#6b7280] focus:border-[#4ade80] focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
