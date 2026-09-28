"use client"

import { useState } from "react"
import type { BlockActivity, Drill } from "@/lib/supabase/types"
import { DrillCombobox } from "./DrillCombobox"

interface Props {
  activities: BlockActivity[]
  drills: Drill[]
  onChange: (activities: BlockActivity[]) => void
}

const EMPTY: BlockActivity = { drill_id: null, drill_name: "", rep_count: null, note: null }

export function ActivityList({ activities, drills, onChange }: Props) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<BlockActivity>(EMPTY)

  function commit() {
    if (!form.drill_name.trim()) return
    onChange([...activities, form])
    setForm(EMPTY)
    setAdding(false)
  }

  function remove(i: number) {
    onChange(activities.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      {/* Existing activities */}
      {activities.map((act, i) => (
        <div
          key={i}
          className="flex items-start justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm text-fg">{act.drill_name}</p>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
              {act.rep_count != null && <span>{act.rep_count} reps</span>}
              {act.note && <span className="italic">{act.note}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 text-xs text-muted transition-colors hover:text-danger"
          >
            ✕
          </button>
        </div>
      ))}

      {/* Inline add form */}
      {adding ? (
        <div className="rounded-md border border-accent/30 bg-surface-2 p-3 space-y-3">
          <DrillCombobox
            drills={drills}
            drillId={form.drill_id}
            freeText={form.drill_name}
            onChange={(id, text) => {
              const name = id ? (drills.find((d) => d.id === id)?.name ?? text) : text
              setForm((f) => ({ ...f, drill_id: id, drill_name: name }))
            }}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={form.rep_count ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, rep_count: e.target.value ? parseInt(e.target.value) : null }))
              }
              placeholder="Reps / putts"
              className="w-full rounded-md border border-line bg-surface-4 px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              value={form.note ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value || null }))}
              placeholder="Quick note"
              className="w-full rounded-md border border-line bg-surface-4 px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={commit}
              disabled={!form.drill_name.trim()}
              className="flex-1 rounded-md bg-accent py-2 text-sm font-semibold text-on-accent disabled:opacity-30"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setForm(EMPTY) }}
              className="rounded-md border border-line px-4 py-2 text-sm text-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-md border border-dashed border-line py-2 text-sm text-muted transition-colors hover:border-fg hover:text-fg"
        >
          + Add Activity
        </button>
      )}
    </div>
  )
}
