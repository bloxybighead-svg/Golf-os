"use client"

import { useState, useTransition } from "react"
import type { Round } from "@/lib/supabase/types"
import { RoundForm } from "./RoundForm"
import { deleteRound } from "@/app/rounds/actions"
import { upAndDownPct } from "@/lib/rounds/holes"

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  })
}

function relToPar(score: number, par: number) {
  const diff = score - par
  if (diff === 0) return { label: "E",        color: "text-fg-2" }
  if (diff > 0)  return { label: `+${diff}`,  color: "text-danger" }
  return           { label: `${diff}`,         color: "text-accent" }
}

// Why a round's adjusted score differs from what was shot (lib/handicap.ts adjustHoles).
const CAP_TITLE: Record<NonNullable<Round["score_cap"]>, string> = {
  net_double_bogey: "Each hole capped at net double bogey (par + 2 + your handicap strokes there)",
  par_plus_5: "Each hole capped at par + 5 (before you had a Handicap Index)",
  approximate: "Each hole capped at about net double bogey (no stroke index, so strokes spread evenly)",
  none: "Score only: posted as entered",
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
  // Percentages computed from holes carry a decimal; show whole numbers.
  const pct = (v: number) => `${Math.round(v)}%`
  const upDownPct = upAndDownPct(round)

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
      "rounded-xl border px-5 py-4 transition-colors",
      compCollapse
        ? "border-danger/40 bg-danger/10 hover:bg-danger/10"
        : "border-fg/[0.06] bg-surface hover:bg-surface-2",
    ].join(" ")}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-fg">{round.course_name}</p>
            {round.is_competitive && (
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                Competitive
              </span>
            )}
            {holes !== 18 && (
              <span className="rounded-full border border-fg/[0.08] bg-surface-3 px-2 py-0.5 text-xs text-muted">
                {holes} holes
              </span>
            )}
            {compCollapse && (
              <span className="rounded-full border border-danger/40 bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
                Tournament collapse
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">{formatDate(round.date)}</p>
          {round.is_competitive && (round.breakdown_tags?.length ?? 0) > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {round.breakdown_tags!.map((tag) => (
                <span
                  key={tag}
                  className={[
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    tag === "None"
                      ? "border-fg/[0.08] bg-surface-3 text-muted"
                      : "border-warn/30 bg-warn/10 text-warn",
                  ].join(" ")}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-2xl font-bold tracking-tight text-fg">{round.score}</span>
          <span className={["text-sm font-semibold", rel.color].join(" ")}>{rel.label}</span>
          {round.adjusted_score != null && round.adjusted_score !== round.score && (
            <span className="text-xs text-muted" title={CAP_TITLE[round.score_cap ?? "none"]}>
              → {round.adjusted_score} adj.
            </span>
          )}
          {round.differential != null && (
            <span className={["text-xs", compCollapse ? "font-semibold text-danger" : "text-muted"].join(" ")}>
              · Diff {round.differential.toFixed(1)}
            </span>
          )}
          {round.differential == null && round.differential_status === "waiting_for_index" && (
            <span className="text-xs text-muted" title="A 9-hole score's differential uses your Handicap Index for the other nine. It fills in once you have 54 holes posted.">
              · Waiting for index
            </span>
          )}
        </div>
      </div>
      {round.score_cap === "none" && round.differential != null && (
        <p className="mt-1 text-xs text-muted">Score only, not capped per hole</p>
      )}
      {round.score_cap === "approximate" && (
        <p className="mt-1 text-xs text-muted">Hole caps approximate: add each hole&rsquo;s HCP for exact net double bogey</p>
      )}

      {/* Stats row */}
      {(round.fairways_pct != null || round.gir_pct != null || hasShortGame || hasMiss) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {round.fairways_pct != null && (
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-muted">FIR</span>
              <span className="text-sm font-semibold text-fg">{pct(round.fairways_pct)}</span>
            </div>
          )}
          {round.gir_pct != null && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted">GIR</span>
              <span className={["text-sm font-semibold", girCollapse ? "text-danger" : "text-fg"].join(" ")}>
                {pct(round.gir_pct)}
              </span>
              {girCollapse && (
                <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                  ⚠ GIR pressure collapse
                </span>
              )}
            </div>
          )}
          {round.total_putts != null && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted">Putts</span>
              <span className="text-sm font-semibold text-fg">{round.total_putts}</span>
              {round.three_putts != null && round.three_putts > 0 && (
                <span className="text-xs text-danger">
                  {round.three_putts} 3-putt{round.three_putts !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
          {round.up_and_downs != null && (
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-muted">U&D</span>
              <span className="text-sm font-semibold text-fg">{upDownPct != null ? pct(upDownPct) : round.up_and_downs}</span>
            </div>
          )}
          {round.penalties != null && round.penalties > 0 && (
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-danger">
                {round.penalties} {round.penalties === 1 ? "penalty" : "penalties"}
              </span>
            </div>
          )}
          {hasMiss && (
            <div className="flex items-center gap-1.5">
              {round.miss_left_pct != null && (
                <span className="text-xs text-muted">← {pct(round.miss_left_pct)}</span>
              )}
              {round.miss_right_pct != null && (
                <span className="text-xs text-muted">{pct(round.miss_right_pct)} →</span>
              )}
            </div>
          )}
        </div>
      )}

      {round.notes && (
        <p className="mt-3 border-t border-fg/[0.04] pt-2.5 text-xs italic text-muted">
          {round.notes}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-4">
        <button onClick={() => setEditing(true)} className="text-xs text-muted hover:text-fg transition-colors">
          edit
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Delete?</span>
            <button
              onClick={() => startTransition(async () => { await deleteRound(round.id) })}
              disabled={isPending}
              className="text-xs font-medium text-danger hover:text-danger disabled:opacity-50"
            >
              {isPending ? "…" : "Yes"}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted hover:text-fg">
              No
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-muted hover:text-danger transition-colors">
            delete
          </button>
        )}
      </div>
    </div>
  )
}
