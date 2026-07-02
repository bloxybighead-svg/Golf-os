"use client"

import { useState, useTransition } from "react"
import type { Round } from "@/lib/supabase/types"
import { RoundForm } from "./RoundForm"
import { deleteRound } from "@/app/rounds/actions"

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  })
}

function relToPar(score: number, par: number) {
  const diff = score - par
  if (diff === 0) return { label: "E",        color: "text-[#d1d5db]" }
  if (diff > 0)  return { label: `+${diff}`,  color: "text-[#f87171]" }
  return           { label: `${diff}`,         color: "text-[#22c55e]" }
}

interface Props { round: Round; casualGirAvg?: number | null }

export function RoundCard({ round, casualGirAvg }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (editing) return <RoundForm round={round} onDone={() => setEditing(false)} />

  const rel = relToPar(round.score, round.par)
  const holes = round.holes_played ?? 18

  const hasMiss = round.miss_left_pct != null || round.miss_right_pct != null
  const hasShortGame = round.total_putts != null || round.up_and_downs != null

  // Dashboard flags
  const compCollapse = round.is_competitive && round.differential != null && round.differential > 8.0
  // Competitive GIR pressure-collapse: GIR falls >20 pts below the casual baseline
  const girCollapse =
    round.is_competitive &&
    casualGirAvg != null &&
    round.gir_pct != null &&
    casualGirAvg - round.gir_pct > 20

  return (
    <div className={[
      "rounded-xl border px-5 py-4 shadow-sm transition-colors",
      compCollapse
        ? "border-red-500/40 bg-red-950/20 hover:bg-red-950/30"
        : "border-white/[0.06] bg-[#111111] hover:bg-[#161616]",
    ].join(" ")}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white">{round.course_name}</p>
            {round.is_competitive && (
              <span className="rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-2 py-0.5 text-xs font-medium text-[#22c55e]">
                Competitive
              </span>
            )}
            {holes !== 18 && (
              <span className="rounded-full border border-white/[0.08] bg-[#1a1a1a] px-2 py-0.5 text-xs text-[#6b7280]">
                {holes} holes
              </span>
            )}
            {compCollapse && (
              <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">
                Tournament collapse
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#6b7280]">{formatDate(round.date)}</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-white">{round.score}</span>
          <span className={["text-sm font-semibold", rel.color].join(" ")}>{rel.label}</span>
          {round.differential != null && (
            <span className={["text-xs", compCollapse ? "font-semibold text-red-400" : "text-[#6b7280]"].join(" ")}>
              · Diff {round.differential.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Stats row */}
      {(round.fairways_pct != null || round.gir_pct != null || hasShortGame || hasMiss) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {round.fairways_pct != null && (
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-[#4b5563]">FIR</span>
              <span className="text-sm font-semibold text-white">{round.fairways_pct}%</span>
            </div>
          )}
          {round.gir_pct != null && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#4b5563]">GIR</span>
              <span className={["text-sm font-semibold", girCollapse ? "text-red-400" : "text-white"].join(" ")}>
                {round.gir_pct}%
              </span>
              {girCollapse && (
                <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                  ⚠ GIR pressure collapse
                </span>
              )}
            </div>
          )}
          {round.total_putts != null && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-[#4b5563]">Putts</span>
              <span className="text-sm font-semibold text-white">{round.total_putts}</span>
              {round.three_putts != null && round.three_putts > 0 && (
                <span className="text-xs text-[#f87171]">
                  {round.three_putts} 3-putt{round.three_putts !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
          {round.up_and_downs != null && (
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-[#4b5563]">U&D</span>
              <span className="text-sm font-semibold text-white">{round.up_and_downs}</span>
            </div>
          )}
          {round.penalties != null && round.penalties > 0 && (
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-[#f87171]">
                {round.penalties} {round.penalties === 1 ? "penalty" : "penalties"}
              </span>
            </div>
          )}
          {hasMiss && (
            <div className="flex items-center gap-1.5">
              {round.miss_left_pct != null && (
                <span className="text-xs text-[#6b7280]">← {round.miss_left_pct}%</span>
              )}
              {round.miss_right_pct != null && (
                <span className="text-xs text-[#6b7280]">{round.miss_right_pct}% →</span>
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
        <button onClick={() => setEditing(true)} className="text-xs text-[#6b7280] hover:text-white transition-colors">
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
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-[#6b7280] hover:text-red-400 transition-colors">
            delete
          </button>
        )}
      </div>
    </div>
  )
}
