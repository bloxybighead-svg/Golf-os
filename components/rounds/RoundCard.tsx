"use client"

import { useState, useTransition } from "react"
import type { Round } from "@/lib/supabase/types"
import { RoundForm } from "./RoundForm"
import { deleteRound } from "@/app/rounds/actions"

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function relToPar(score: number, par: number) {
  const diff = score - par
  if (diff === 0) return { label: "E", color: "text-white" }
  if (diff > 0) return { label: `+${diff}`, color: "text-[#f87171]" }
  return { label: `${diff}`, color: "text-[#22c55e]" }
}

interface Props {
  round: Round
}

export function RoundCard({ round }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (editing) {
    return <RoundForm round={round} onDone={() => setEditing(false)} />
  }

  const rel = relToPar(round.score, round.par)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm transition-colors hover:bg-[#161616]">
      {/* Top row: date + course + score */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{round.course_name}</p>
          <p className="mt-0.5 text-xs text-[#6b7280]">{formatDate(round.date)}</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-white">{round.score}</span>
          <span className={["text-sm font-semibold", rel.color].join(" ")}>{rel.label}</span>
        </div>
      </div>

      {/* Stats row */}
      {(round.gir != null || round.fairways_hit != null || round.total_putts != null) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {round.gir != null && (
            <div>
              <span className="text-xs text-[#4b5563]">GIR </span>
              <span className="text-xs font-semibold text-white">{round.gir}/18</span>
              <span className="ml-1 text-xs text-[#4b5563]">
                ({Math.round((round.gir / 18) * 100)}%)
              </span>
            </div>
          )}
          {round.fairways_hit != null && round.fairways_total != null && (
            <div>
              <span className="text-xs text-[#4b5563]">FIR </span>
              <span className="text-xs font-semibold text-white">
                {round.fairways_hit}/{round.fairways_total}
              </span>
              <span className="ml-1 text-xs text-[#4b5563]">
                ({Math.round((round.fairways_hit / round.fairways_total) * 100)}%)
              </span>
            </div>
          )}
          {round.total_putts != null && (
            <div>
              <span className="text-xs text-[#4b5563]">Putts </span>
              <span className="text-xs font-semibold text-white">{round.total_putts}</span>
              {round.gir != null && (
                <span className="ml-1 text-xs text-[#4b5563]">
                  ({(round.total_putts / 18).toFixed(1)}/hole)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {round.notes && (
        <p className="mt-3 border-t border-white/[0.04] pt-2.5 text-xs italic text-[#6b7280]">
          {round.notes}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-4">
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
              onClick={() => startTransition(async () => { await deleteRound(round.id) })}
              disabled={isPending}
              className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
            >
              {isPending ? "…" : "Yes"}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#6b7280] hover:text-white">
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
