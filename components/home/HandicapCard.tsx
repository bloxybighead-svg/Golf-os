"use client"

import { useEffect, useState, useTransition } from "react"
import { RefreshCw, Pencil } from "lucide-react"
import type { HandicapEntry } from "@/lib/supabase/types"
import { recalculateHandicap, saveManualHandicap } from "@/app/handicap/actions"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtIndex(n: number) {
  return n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1)
}

interface Props {
  latest: HandicapEntry | null
  /** Best-8-of-20 estimate computed live from currently loaded rounds, used as a preview before the first Recalculate. */
  liveEstimate: number | null
  signedIn: boolean
}

export function HandicapCard({ latest, liveEstimate, signedIn }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingManual, setEditingManual] = useState(false)
  const [manualValue, setManualValue] = useState("")
  const [manualNotes, setManualNotes] = useState("")
  // calculation_date is formatted in the viewer's timezone, which the server
  // (UTC) can't know -- render it only after mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  function recalc() {
    setError(null)
    startTransition(async () => {
      try {
        await recalculateHandicap()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't calculate a handicap yet.")
      }
    })
  }

  function saveManual() {
    const v = parseFloat(manualValue)
    if (!Number.isFinite(v)) {
      setError("Enter a valid handicap index.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await saveManualHandicap(v, manualNotes.trim() || null)
        setEditingManual(false)
        setManualValue("")
        setManualNotes("")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that handicap.")
      }
    })
  }

  const displayIndex = latest?.handicap_index ?? liveEstimate
  const isEstimate = latest ? latest.source === "calculated" : liveEstimate != null

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-xs mb-2">Handicap Index</p>
          {displayIndex != null ? (
            <>
              <p className="text-3xl font-bold tracking-tight text-accent">{fmtIndex(displayIndex)}</p>
              <p className="mt-1 text-xs text-muted">
                {latest
                  ? `${latest.source === "manual" ? "Manual entry" : `Calculated from ${latest.rounds_used} rounds`}${mounted ? ` · ${formatDate(latest.calculation_date)}` : ""}`
                  : "Live estimate — Recalculate to save it"}
              </p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold tracking-tight text-muted">—</p>
              <p className="mt-1 text-xs text-muted">Log at least 8 rated rounds to calculate</p>
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            onClick={recalc}
            disabled={isPending || !signedIn || liveEstimate == null}
            title={!signedIn ? "Sign in to calculate" : undefined}
            className="flex items-center gap-1.5 rounded-lg border border-fg/[0.08] bg-surface-3 px-3 py-1.5 text-xs font-medium text-fg-3 transition-colors hover:text-fg hover:border-fg/20 disabled:opacity-30"
          >
            <RefreshCw size={12} className={isPending ? "animate-spin" : ""} />
            Recalculate
          </button>
          <button
            onClick={() => setEditingManual((v) => !v)}
            disabled={!signedIn}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors disabled:opacity-30"
          >
            <Pencil size={11} />
            Enter manually
          </button>
        </div>
      </div>

      {editingManual && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-fg/[0.04] pt-4">
          <div>
            <label className="mb-1 block text-xs text-muted">Handicap Index</label>
            <input
              type="number" inputMode="decimal" step="0.1"
              value={manualValue} onChange={(e) => setManualValue(e.target.value)}
              placeholder="e.g. 2.4"
              className="w-28 rounded-lg border border-fg/[0.08] bg-surface-3 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-xs text-muted">Notes (optional)</label>
            <input
              type="text" value={manualNotes} onChange={(e) => setManualNotes(e.target.value)}
              placeholder="e.g. Official GHIN"
              className="w-full rounded-lg border border-fg/[0.08] bg-surface-3 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
          <button
            onClick={saveManual}
            disabled={isPending || !manualValue}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-30"
          >
            Save
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {isEstimate && displayIndex != null && (
        <p className="mt-3 text-xs text-muted">
          Best 8 of your last 20 differentials × 0.96 · Estimated — simplified calculation,
          excludes official safeguards and caps, not your real GHIN Index.
        </p>
      )}
    </div>
  )
}
