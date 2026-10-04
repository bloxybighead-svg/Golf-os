"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import type { HandicapEntry } from "@/lib/supabase/types"
import { saveManualHandicap } from "@/app/handicap/actions"
import { InfoTip } from "@/components/InfoTip"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmtIndex(n: number) {
  return n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1)
}

interface Props {
  latest: HandicapEntry | null
  /** WHS index computed from the loaded rounds' differentials, shown until a round save records one. */
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
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-xs mb-1 flex items-center gap-1.5">
            Handicap
            {isEstimate && displayIndex != null && (
              <InfoTip label="How your handicap is worked out">
                World Handicap System: the lowest 8 of your last 20 differentials averaged (fewer with under 20
                rounds), rounded to a tenth. Hole-by-hole rounds are capped at net double bogey, and 9-hole rounds
                are completed with your expected score. Updated each time you save a round. It leaves out the
                playing-conditions adjustment and the caps on how fast it can rise, so it&rsquo;s close to, not the
                same as, your GHIN Index.
              </InfoTip>
            )}
          </p>
          {displayIndex != null ? (
            <>
              <p className="text-5xl font-semibold leading-tight tracking-tight text-fg tabular-nums">{fmtIndex(displayIndex)}</p>
              <p className="mt-1 text-xs text-muted">
                {latest
                  ? `${latest.source === "manual" ? "Entered by hand" : `From your last ${latest.rounds_used} rounds`}${mounted ? ` · ${formatDate(latest.calculation_date)}` : ""}`
                  : "From your recent rounds"}
              </p>
            </>
          ) : (
            <>
              <p className="text-5xl font-semibold leading-tight tracking-tight text-muted">—</p>
              <p className="mt-1 text-sm text-fg-3">
                Needs 54 holes of rated rounds (three 18s).{" "}
                <Link href="/rounds?new=1" className="font-semibold text-accent hover:underline">
                  Add round
                </Link>
              </p>
            </>
          )}
        </div>
        {signedIn ? (
          <button
            onClick={() => setEditingManual((v) => !v)}
            className="min-h-[44px] shrink-0 text-xs text-muted transition-colors hover:text-fg md:min-h-0"
          >
            Enter manually
          </button>
        ) : (
          // Guests can't save an index; a faded-out button read as broken, so it's a sign-in link.
          <Link
            href="/login?redirect=%2Fyou%2Fstats"
            className="flex min-h-[44px] shrink-0 items-center text-xs font-semibold text-accent hover:underline md:min-h-0"
          >
            Sign in to enter
          </Link>
        )}
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

    </div>
  )
}
