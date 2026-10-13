"use client"

import { useState } from "react"
import { InfoTip } from "@/components/InfoTip"
import { CATEGORY_LABEL } from "@/lib/drillRecommendations"
import type { SgSummary } from "@/lib/rounds/strokesGained"
import type { ShotSgData } from "@/lib/supabase/loadShotSg"

// Full bar width at 2 strokes per 18 holes; a larger number just caps the bar.
const BAR_SCALE_MAX = 2

function fmt(n: number) {
  return `${n > 0 ? "+" : n < 0 ? "–" : ""}${Math.abs(n).toFixed(2)}`
}

function Rows({ summary }: { summary: SgSummary }) {
  return (
    <div className="space-y-4">
      {summary.categories.map((c) => {
        const positive = c.per18 >= 0
        return (
          <div key={c.category}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-fg">{CATEGORY_LABEL[c.category]}</span>
              <span className={["text-xs font-semibold", positive ? "text-accent" : "text-danger"].join(" ")}>{fmt(c.per18)} SG</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={["h-full rounded-full", positive ? "bg-accent" : "bg-danger"].join(" ")}
                style={{ width: `${Math.max(Math.min(Math.abs(c.per18) / BAR_SCALE_MAX, 1) * 100, 3)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">{c.shots} shots</p>
          </div>
        )
      })}
    </div>
  )
}

/** Strokes gained by category from the last rounds' recorded shots, against a scratch golfer or the golfer's own handicap. */
export function ShotSgCard({ data }: { data: ShotSgData }) {
  const [vsMine, setVsMine] = useState(false)
  const shown = vsMine && data.mine ? data.mine : { label: "scratch", summary: data.scratch }
  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="label-xs flex items-center gap-1.5">
          Strokes gained
          <InfoTip label="How strokes gained is worked out">
            From the shots you recorded on Play: each shot is the strokes a {shown.label} golfer needs before it, minus after it, minus the shot
            itself. Only holes where every stroke was recorded count, and numbers are per 18 holes.
          </InfoTip>
        </p>
        <p className="text-xs text-muted">last {data.rounds} rounds</p>
      </div>
      {data.mine && (
        <div role="radiogroup" aria-label="Compare against" className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-fg/[0.06] bg-surface-3 p-1">
          {([["Scratch", false], ["My handicap", true]] as const).map(([label, mine]) => (
            <button
              key={label}
              role="radio"
              aria-checked={vsMine === mine}
              onClick={() => setVsMine(mine)}
              className={`min-h-[44px] rounded-md px-3 text-xs font-normal transition-colors md:min-h-[32px] ${vsMine === mine ? "bg-surface text-fg" : "text-muted hover:text-fg"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4">
        <Rows summary={shown.summary} />
      </div>
      <p className="mt-3 text-xs text-muted">vs {shown.label} · {shown.summary.holesCounted} holes with every shot recorded</p>
    </div>
  )
}
