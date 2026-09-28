"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronDown } from "lucide-react"
import type { CategoryTrend } from "@/lib/sgBenchmarks"
import { qualifierFor } from "@/lib/sgBenchmarks"
import { InfoTip } from "@/components/InfoTip"

const LABEL: Record<CategoryTrend["category"], string> = {
  off_tee: "Off-Tee",
  approach: "Approach",
  short_game: "Short Game",
  putting: "Putting",
}

// Full bar width at a +/-2 stroke delta -- covers the typical range this
// proxy produces (see lib/sgBenchmarks.ts); larger deltas just cap the bar.
const BAR_SCALE_MAX = 2

function fmtDelta(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "–" : ""
  return `${sign}${Math.abs(n).toFixed(2)} SG`
}

function Bar({ trend }: { trend: CategoryTrend }) {
  const positive = trend.avgDeltaSg >= 0
  const widthPct = Math.min(Math.abs(trend.avgDeltaSg) / BAR_SCALE_MAX, 1) * 100
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-fg">{LABEL[trend.category]}</span>
        <span className={["text-xs font-semibold", positive ? "text-accent" : "text-danger"].join(" ")}>
          {fmtDelta(trend.avgDeltaSg)}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          className={["h-full rounded-full", positive ? "bg-accent" : "bg-danger"].join(" ")}
          style={{ width: `${Math.max(widthPct, 3)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        {qualifierFor(trend.avgDeltaSg)} · {trend.roundsCounted} round{trend.roundsCounted !== 1 ? "s" : ""}
      </p>
    </div>
  )
}

export function TrendsCard({ trends }: { trends: CategoryTrend[] }) {
  const [expanded, setExpanded] = useState(false)

  if (trends.length === 0) {
    return (
      <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
        <p className="label-xs mb-2">Strengths & Weaknesses</p>
        <p className="text-sm text-fg-3">
          Needs rounds with stats.{" "}
          <Link href="/rounds?new=1" className="font-semibold text-accent hover:underline">
            Add round
          </Link>
        </p>
      </div>
    )
  }

  const weakest = [...trends].sort((a, b) => a.avgDeltaSg - b.avgDeltaSg).slice(0, 2)

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="label-xs flex items-center gap-1.5">
          Strengths & Weaknesses
          <InfoTip label="How strengths and weaknesses are worked out">
            Estimated from your fairways, greens, putts and up-and-downs, not shot-by-shot strokes gained. Each area is
            compared with typical stats for your handicap, so treat it as a guide, not a precise measurement.
          </InfoTip>
        </p>
        <p className="text-xs text-muted">last {trends[0].roundsCounted} rounds</p>
      </div>

      {/* Compact summary, always visible; the full breakdown opens below it on every screen size */}
      <p className="mt-2 text-sm text-fg-3">
        Your weakest: {weakest.map((t) => `${LABEL[t.category]} (${fmtDelta(t.avgDeltaSg)})`).join(", ")}
      </p>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-1 flex min-h-[44px] items-center gap-1 text-xs font-medium text-muted hover:text-fg md:min-h-[32px]"
      >
        <ChevronDown size={13} className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
        {expanded ? "Hide full breakdown" : "Show full breakdown"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4 border-t border-fg/[0.04] pt-4">
          {trends.map((t) => (
            <Bar key={t.category} trend={t} />
          ))}
        </div>
      )}
    </div>
  )
}
