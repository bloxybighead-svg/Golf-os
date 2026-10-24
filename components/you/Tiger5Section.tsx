"use client"

import { useMemo, useState } from "react"
import { InfoTip } from "@/components/InfoTip"
import { EmptyHint } from "@/components/EmptyHint"
import { TIGER5_LABEL, summarizeTiger5, tiger5 } from "@/lib/rounds/tiger5"
import type { SgRoundData } from "@/lib/supabase/loadSgData"

/** A bar chart only means something with this many rounds behind it; fewer show the numbers alone. From the spec. */
const MIN_ROUNDS_FOR_BARS = 5

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

/** Tiger 5 over the recent rounds entered hole by hole: mistakes per 18, the most frequent, and each item on tap. */
export function Tiger5Section({ data }: { data: SgRoundData[] }) {
  const [open, setOpen] = useState(false)
  const rounds = useMemo(
    () => data.map((d) => ({ meta: d.meta, holesPlayed: d.round.holes_played, result: tiger5({ holes: d.holes, shots: d.shots, three_putts: d.round.three_putts ?? null }) })),
    [data]
  )
  const summary = useMemo(() => summarizeTiger5(rounds), [rounds])
  const worst = Math.max(1, ...rounds.map((r) => r.result.total))

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <p className="label-xs flex items-center gap-1.5">
        Tiger 5
        <InfoTip label="What Tiger 5 counts">
          Five round-killing mistakes: a bogey or worse on a par 5, a double bogey or worse, a three-putt, a bogey or worse with a 9-iron or less in hand,
          and a blown easy up-and-down. Items the round can&apos;t tell are left out, not counted as zero.
        </InfoTip>
      </p>

      {summary.per18 == null ? (
        <div className="mt-3">
          <EmptyHint action="Log a round" href="/rounds?new=1">
            Needs a hole-by-hole round.
          </EmptyHint>
        </div>
      ) : (
        <>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-2 flex min-h-[44px] w-full flex-col justify-center text-left">
            <span className="text-sm text-fg-2">
              <span className="text-2xl font-semibold tracking-tight text-fg">{one(summary.per18)}</span> per 18
              {summary.most && <span> · most often {TIGER5_LABEL[summary.most].many}</span>}
            </span>
            <span className="text-xs text-muted">Last {summary.rounds} hole-by-hole round{summary.rounds === 1 ? "" : "s"}</span>
          </button>

          {open && (
            <ul className="divide-y divide-fg/[0.06]">
              {summary.items.map((i) => (
                <li key={i.item} className="flex min-h-[44px] items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="text-fg-2">{TIGER5_LABEL[i.item].many}</span>
                  <span className="text-fg">
                    {i.per18 == null ? <span className="text-muted">unknown</span> : <><span className="font-semibold">{one(i.per18)}</span> per 18 · {i.count} in {i.rounds}</>}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {summary.rounds >= MIN_ROUNDS_FOR_BARS && (
            <ul className="mt-3 space-y-1.5" aria-label="Tiger 5 by round">
              {[...rounds].reverse().map((r, i) => (
                <li key={i} className="flex items-center gap-3 text-xs text-muted">
                  <span className="w-12 shrink-0">{shortDate(r.meta.date)}</span>
                  <span className="h-2 flex-1 rounded-sm bg-fg/[0.06]">
                    <span className="block h-2 rounded-sm bg-accent" style={{ width: `${(r.result.total / worst) * 100}%` }} />
                  </span>
                  <span className="w-5 shrink-0 text-right text-fg">{r.result.total}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
