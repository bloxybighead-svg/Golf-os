"use client"

import { useState, useTransition } from "react"
import type { Drill, DrillCategory } from "@/lib/supabase/types"
import { createDrill, updateDrill } from "@/app/drills/actions"

const CATEGORIES: DrillCategory[] = ["Full Swing", "Wedge", "Chipping", "Bunker", "Putting", "Mental"]

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
    <div className="fixed inset-0 z-50 flex flex-col bg-page">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
        <button type="button" onClick={onDone} className="text-sm text-muted hover:text-fg transition-colors">
          Cancel
        </button>
        <span className="text-sm font-semibold text-fg">
          {drill ? "Edit Drill" : "New Drill"}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || isPending}
          className="text-sm font-semibold text-accent-hi hover:opacity-80 disabled:opacity-30 transition-opacity"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
        {/* Name */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
            Drill Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Stockton Clock Drill"
            className="w-full rounded-md border border-line bg-surface-4 px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {/* Category */}
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={[
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  category === c
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line text-muted hover:border-fg hover:text-fg",
                ].join(" ")}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What do you do in this drill?"
            rows={3}
            className="w-full resize-none rounded-md border border-line bg-surface-4 px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {/* Target metric */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
            Success Looks Like
          </label>
          <input
            type="text"
            value={targetMetric}
            onChange={(e) => setTargetMetric(e.target.value)}
            placeholder="e.g. All 12 in a row, within 3 feet"
            className="w-full rounded-md border border-line bg-surface-4 px-3 py-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
