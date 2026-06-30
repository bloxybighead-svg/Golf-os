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
    <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-4 py-3.5 shadow-sm transition-colors hover:bg-[#161616]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{drill.name}</p>
          {drill.description && (
            <p className="mt-0.5 text-xs text-[#6b7280] line-clamp-2">{drill.description}</p>
          )}
        </div>
        {/* Usage badge */}
        {usageCount > 0 && (
          <span className="shrink-0 rounded-full bg-[#1a1a1a] px-2 py-0.5 text-xs font-semibold text-[#22c55e]">
            ×{usageCount}
          </span>
        )}
      </div>

      {drill.target_metric && (
        <p className="mt-2 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#6b7280]">
          <span className="text-[#e5e5e5]">Goal: </span>{drill.target_metric}
        </p>
      )}

      {/* Actions */}
      <div className="mt-2.5 flex items-center gap-4">
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-[#6b7280] hover:text-white transition-colors"
        >
          edit
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b7280]">Delete?</span>
            <button
              onClick={() => startTransition(async () => { await deleteDrill(drill.id) })}
              disabled={isPending}
              className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              {isPending ? "…" : "Yes"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-[#6b7280] hover:text-white"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-[#6b7280] hover:text-red-400 transition-colors"
          >
            delete
          </button>
        )}
      </div>
    </div>
  )
}
