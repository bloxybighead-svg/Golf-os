"use client"

import { useState, useTransition } from "react"
import type { Drill } from "@/lib/supabase/types"
import { DrillForm } from "./DrillForm"
import { deleteDrill } from "@/app/drills/actions"

interface Props {
  drill: Drill
  usageCount: number
}

export function DrillCard({ drill, usageCount }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (editing) {
    return <DrillForm drill={drill} onDone={() => setEditing(false)} />
  }

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-4 py-3.5 shadow-sm transition-colors hover:bg-surface-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{drill.name}</p>
          {drill.description && (
            <p className="mt-0.5 text-xs text-muted line-clamp-2">{drill.description}</p>
          )}
        </div>
        {/* Usage badge */}
        {usageCount > 0 && (
          <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-accent">
            ×{usageCount}
          </span>
        )}
      </div>

      {drill.target_metric && (
        <p className="mt-2 rounded-lg bg-surface-3 px-3 py-1.5 text-xs text-muted">
          <span className="text-fg-2">Goal: </span>{drill.target_metric}
        </p>
      )}

      {/* Actions */}
      <div className="mt-2.5 flex items-center gap-4">
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-muted hover:text-fg transition-colors"
        >
          edit
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Delete?</span>
            <button
              onClick={() => startTransition(async () => { await deleteDrill(drill.id) })}
              disabled={isPending}
              className="text-xs font-medium text-danger hover:text-danger disabled:opacity-50"
            >
              {isPending ? "…" : "Yes"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-muted hover:text-fg"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-muted hover:text-danger transition-colors"
          >
            delete
          </button>
        )}
      </div>
    </div>
  )
}
