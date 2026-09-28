"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import type { CategoryTrend } from "@/lib/sgBenchmarks"
import { qualifierFor } from "@/lib/sgBenchmarks"

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
      <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
        <p className="label-xs mb-2">Strengths & Weaknesses</p>
        <p className="text-sm text-muted">
          Log rounds with fairways%/GIR%/putts and calculate your handicap to see how each part of your
          game compares to golfers at your level.
        </p>
      </div>
    )
  }

  const weakest = [...trends].sort((a, b) => a.avgDeltaSg - b.avgDeltaSg).slice(0, 2)

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="label-xs">Strengths & Weaknesses</p>
        <p className="text-xs text-muted">last {trends[0].roundsCounted} rounds</p>
      </div>

      {/* Compact summary — always visible, so nothing shifts when expanding on mobile */}
      <p className="mt-2 text-sm text-fg-3 md:hidden">
        Your weakest: {weakest.map((t) => `${LABEL[t.category]} (${fmtDelta(t.avgDeltaSg)})`).join(", ")}
      </p>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-muted hover:text-fg md:hidden"
      >
        <ChevronDown size={13} className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
        {expanded ? "Hide full breakdown" : "Show full breakdown"}
      </button>

      {/* Full breakdown — always shown on desktop; toggled on mobile */}
      <div className={["mt-4 space-y-4 border-t border-fg/[0.04] pt-4", expanded ? "block" : "hidden md:block"].join(" ")}>
        {trends.map((t) => (
          <Bar key={t.category} trend={t} />
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">
        Estimated from fairways%/GIR%/putts/up-and-downs, not shot-tracked strokes gained — a proxy
        compared against typical stats for your handicap bracket, not a precise measurement.
      </p>
    </div>
  )
}
