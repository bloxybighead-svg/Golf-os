"use client"

import { useState } from "react"
import { InfoTip } from "@/components/InfoTip"
import { CATEGORY_LABEL } from "@/lib/drillRecommendations"
import { describeBasis, formatSg as fmtSg, summarizeRounds, type SgSummary } from "@/lib/rounds/roundSg"
import { useSgResults } from "@/hooks/useSgResults"
import type { ClubFit } from "@/lib/golfer/shotProfile"
import type { SgRoundData } from "@/lib/supabase/loadSgData"
import type { SgCategory } from "@/lib/sgBenchmarks"

/** A bar chart only means something with this many rounds behind it; fewer show the numbers alone. From the spec. */
const MIN_ROUNDS_FOR_BARS = 5
// Full bar width at 2 strokes per round; a larger number just caps the bar.
const BAR_SCALE_MAX = 2

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })

/** Strokes gained in the four categories over the last rounds, from the scorecard, tracked shots or round totals, against the chosen level. */
export function SgSection({ data, fits, ownHandicap }: { data: SgRoundData[]; fits: ClubFit[] | null; ownHandicap: number | null }) {
  const { ready, label, results } = useSgResults(data, fits, ownHandicap)
  return <SgView ready={ready || data.length === 0} label={label} summary={summarizeRounds(results)} meta={new Map(data.map((d) => [d.round.id, d.meta]))} />
}

export function SgView({
  ready,
  label,
  summary,
  meta,
}: {
  ready: boolean
  label: string
  summary: SgSummary
  meta: ReadonlyMap<string, SgRoundData["meta"]>
}) {
  const [open, setOpen] = useState<SgCategory | null>(null)
  const bars = summary.rounds >= MIN_ROUNDS_FOR_BARS

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="label-xs flex items-center gap-1.5">
          Strokes gained
          <InfoTip label="How strokes gained is worked out">
            Each hole is split into off the tee, approach, around the green and putting. The strokes a {label} golfer needs before each part, minus
            after it, minus the strokes you took. From your scorecard unless you tracked every shot on that hole. Where the app has to guess
            (where your drive finished, your first putt), it says so in the round&apos;s detail.
          </InfoTip>
        </p>
        <p className="text-xs text-muted">vs {label}</p>
      </div>

      {ready && summary.rounds === 0 ? (
        <p className="mt-3 text-sm text-fg-3">Needs a round with a score.</p>
      ) : (
        <>
          {summary.totalPerRound != null && (
            <p className="mt-3 text-sm text-fg-2">
              <span className="text-2xl font-semibold tracking-tight text-fg">{fmtSg(summary.totalPerRound)}</span> strokes per round
            </p>
          )}
          <ul className="mt-2 divide-y divide-fg/[0.06]">
            {summary.categories.map((c) => {
              const positive = (c.perRound ?? 0) >= 0
              const expanded = open === c.category
              return (
                <li key={c.category}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    disabled={c.perRound == null}
                    onClick={() => setOpen(expanded ? null : c.category)}
                    className="flex min-h-[44px] w-full flex-col justify-center py-2 text-left"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-fg">{CATEGORY_LABEL[c.category]}</span>
                      {c.perRound == null ? (
                        <span className="text-xs text-muted">No data</span>
                      ) : (
                        <span className={["text-sm font-semibold", positive ? "text-accent" : "text-danger"].join(" ")}>{fmtSg(c.perRound)}</span>
                      )}
                    </span>
                    {bars && c.perRound != null && (
                      <span className="mt-1.5 block h-2 w-full overflow-hidden rounded-full bg-surface-3">
                        <span
                          className={["block h-full rounded-full", positive ? "bg-accent" : "bg-danger"].join(" ")}
                          style={{ width: `${Math.max(Math.min(Math.abs(c.perRound) / BAR_SCALE_MAX, 1) * 100, 3)}%` }}
                        />
                      </span>
                    )}
                  </button>
                  {expanded && (
                    <ul className="pb-2 text-sm">
                      {c.rounds.map((r) => (
                        <li key={r.roundId} className="flex justify-between gap-3 py-1 text-fg-2">
                          <span className="min-w-0 truncate">
                            {meta.get(r.roundId) ? `${shortDate(meta.get(r.roundId)!.date)} · ${meta.get(r.roundId)!.courseName}` : r.roundId}
                          </span>
                          <span className={r.value >= 0 ? "text-accent" : "text-danger"}>{fmtSg(r.value)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
          {summary.rounds > 0 && <p className="mt-2 text-xs text-muted">{describeBasis(summary)}. Per 18 holes.</p>}
        </>
      )}
    </div>
  )
}
