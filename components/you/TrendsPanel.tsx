"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ChevronDown, Plus, TrendingUp, X } from "lucide-react"
import {
  LineChart, Line, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine,
} from "recharts"
import type { Round, Milestone } from "@/lib/supabase/types"
import { createMilestone, deleteMilestone } from "@/app/you/milestone-actions"
import { cssColor, useThemeColor } from "@/lib/theme/tokens"
import { InfoTip } from "@/components/InfoTip"

type Metric = "scores" | "putts" | "fairways" | "greens"

// Scores first: that's what the panel opens on.
const METRICS: { value: Metric; label: string }[] = [
  { value: "scores", label: "Round scores over time" },
  { value: "putts", label: "Putts" },
  { value: "fairways", label: "Fairways hit" },
  { value: "greens", label: "Greens in regulation" },
]

const RECENT = 5 // "last 5 rounds" in the summary line

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

function shortDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

// Index of the round closest in time to a date (the first one, if several share a day).
function nearestIndex(dateISO: string, points: { rawDate: string }[]): number {
  if (points.length === 0) return -1
  const m = new Date(dateISO + "T12:00:00").getTime()
  let best = 0, bestDiff = Infinity
  points.forEach((p, i) => {
    const d = Math.abs(new Date(p.rawDate + "T12:00:00").getTime() - m)
    if (d < bestDiff) { bestDiff = d; best = i }
  })
  return best
}

// ── chart primitives ─────────────────────────────────────────────
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-fg/[0.1] bg-surface-3 px-3 py-2">
      <p className="mb-1 text-xs font-medium text-fg">{payload[0]?.payload?.date}</p>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <p key={p.name} className="text-xs" style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

type Color = ReturnType<typeof useThemeColor>

function axisProps(c: Color) {
  return {
    stroke: c("faint"),
    tick: { fill: c("muted"), fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: c("fg", 0.08) },
  }
}

const LEGEND_STYLE = { fontSize: 11, color: cssColor("muted") }

const MARGIN = { top: 12, right: 8, left: -20, bottom: 0 }

// Each round is its own x position (its index), labelled with its date. Dates
// alone can't be the x value: same-day rounds repeat a label, which makes
// recharts drop reference lines and stack the points on top of each other.
function xAxisProps(points: { date: string }[], c: Color) {
  return { dataKey: "i", tickFormatter: (i: number) => points[i]?.date ?? "", minTickGap: 24, ...axisProps(c) }
}
const indexed = <T,>(points: T[]) => points.map((p, i) => ({ ...p, i }))

// Vertical dashed milestone markers for a given chart's point set. Returned as
// plain elements (called as a function, not rendered as <MilestoneLines />):
// recharts 3 only picks up ReferenceLines that are direct children of the chart.
function milestoneLines(
  c: Color,
  milestones: Milestone[],
  points: { rawDate: string }[],
  yAxisId?: string
) {
  return milestones.flatMap((ms) => {
    const at = nearestIndex(ms.date, points)
    if (at < 0) return []
    return [
      <ReferenceLine
        key={ms.id}
        x={at}
        {...(yAxisId ? { yAxisId } : {})}
        stroke={c("muted")}
        strokeDasharray="4 4"
        label={{ value: ms.label, position: "insideTopRight", fill: c("fg-3"), fontSize: 10 }}
      />,
    ]
  })
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-10 text-center text-sm text-fg-3">
      {children}{" "}
      <Link href="/rounds?new=1" className="font-semibold text-accent hover:underline">
        Add round
      </Link>
    </p>
  )
}

// ── milestone manager ────────────────────────────────────────────
function MilestoneManager({ milestones }: { milestones: Milestone[] }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [label, setLabel] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (!label.trim() || !date) return
    setError(null)
    startTransition(async () => {
      try {
        await createMilestone(date, label)
        setLabel("")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save that marker.")
      }
    })
  }

  return (
    <div className="mt-4 border-t border-fg/[0.04] pt-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-xs text-muted">
          {milestones.length === 0
            ? "Milestone markers"
            : `${milestones.length} milestone marker${milestones.length !== 1 ? "s" : ""} on charts`}
        </span>
        <span className="text-xs text-muted">{open ? "Hide" : "Manage"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Date</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-fg/[0.08] bg-surface-3 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs text-muted">Label</label>
              <input
                type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="e.g. Grip Fix"
                className="w-full rounded-lg border border-fg/[0.08] bg-surface-3 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>
            <button
              onClick={add}
              disabled={!label.trim() || isPending}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-30"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          {milestones.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {milestones.map((ms) => (
                <span
                  key={ms.id}
                  className="flex items-center gap-2 rounded-full border border-fg/[0.08] bg-surface-3 px-3 py-1 text-xs text-fg-3"
                >
                  <span className="text-muted">{shortDate(ms.date)}</span>
                  <span className="font-medium text-fg">{ms.label}</span>
                  <button
                    onClick={() => startTransition(async () => {
                      try { await deleteMilestone(ms.id) } catch (e) { setError(e instanceof Error ? e.message : "Couldn't delete that marker.") }
                    })}
                    aria-label={`Delete ${ms.label}`}
                    className="text-muted hover:text-danger"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  rounds: Round[] // oldest first
  milestones: Milestone[]
}

export function TrendsPanel({ rounds, milestones }: Props) {
  const c = useThemeColor()
  const ACCENT = c("accent")
  const BLUE = c("viz-blue")
  const ORANGE = c("viz-orange")
  const FALLBACK = c("fg-3")
  const AXIS = axisProps(c)
  const GRID = c("fg", 0.03)
  const CURSOR_LINE = { stroke: c("fg", 0.08) }
  const CURSOR_FILL = { fill: c("fg", 0.03) }
  const [open, setOpen] = useState(true)
  const [metric, setMetric] = useState<Metric>("scores")

  // ── Scores: differential + 5-round average, strokes-vs-par fallback ──
  const diffSeq: number[] = []
  const scorePoints = indexed(rounds.map((r) => {
    const diff = r.differential
    let roll: number | null = null
    if (diff != null) {
      diffSeq.push(diff)
      roll = r1(avg(diffSeq.slice(-5))!)
    }
    // Fallback for rounds with no rating/slope: strokes vs par per hole
    const svp = diff == null && r.holes_played > 0 ? r2((r.score - r.par) / r.holes_played) : null
    return {
      rawDate: r.date,
      date: shortDate(r.date),
      Differential: diff != null ? r1(diff) : null,
      "5-round avg": roll,
      "Strokes vs Par / hole": svp,
    }
  }))
  const hasFallback = scorePoints.some((p) => p["Strokes vs Par / hole"] != null)
  const diffCount = scorePoints.filter((p) => p.Differential != null).length
  const avgDiff = avg(rounds.map((r) => r.differential).filter((n): n is number => n != null))

  // ── Putts (per-hole rates so 9- and 18-hole rounds compare) ──────
  const puttsRounds = rounds.filter((r) => r.total_putts != null && r.holes_played > 0)
  const puttsPoints = indexed(puttsRounds.map((r) => ({
    rawDate: r.date,
    date: shortDate(r.date),
    "Putts / hole": r2((r.total_putts as number) / r.holes_played),
    "3-Putt %": r.three_putts != null ? r1((r.three_putts / r.holes_played) * 100) : null,
  })))
  const puttsAvg = avg(puttsPoints.map((p) => p["Putts / hole"]))
  const puttsRecent = avg(puttsPoints.slice(-RECENT).map((p) => p["Putts / hole"]))

  // ── Fairways / greens ────────────────────────────────────────────
  const fairwayPoints = indexed(rounds.filter((r) => r.fairways_pct != null)
    .map((r) => ({ rawDate: r.date, date: shortDate(r.date), "Fairways %": r.fairways_pct as number })))
  const girPoints = indexed(rounds.filter((r) => r.gir_pct != null)
    .map((r) => ({ rawDate: r.date, date: shortDate(r.date), "GIR %": r.gir_pct as number })))
  const fairwayAvg = avg(fairwayPoints.map((p) => p["Fairways %"]))
  const fairwayRecent = avg(fairwayPoints.slice(-RECENT).map((p) => p["Fairways %"]))
  const girAvg = avg(girPoints.map((p) => p["GIR %"]))
  const girRecent = avg(girPoints.slice(-RECENT).map((p) => p["GIR %"]))

  const pct = (n: number | null) => (n != null ? `${Math.round(n)}%` : "—")

  let summary = ""
  let body: React.ReactNode
  let caption = ""

  if (metric === "scores") {
    summary = avgDiff != null ? `Average differential: ${avgDiff.toFixed(1)} across ${diffCount} rated rounds · lower is better` : ""
    caption = `${diffCount} of ${rounds.length} rounds have rating/slope. Differentials put 9- and 18-hole rounds on one scale, since the rating and slope you enter already reflect the tees played.${hasFallback ? " Grey line = strokes vs par per hole (right axis) for rounds without rating/slope." : ""}`
    body = rounds.length < 2 ? (
      <Empty>Needs 2 rounds.</Empty>
    ) : (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={scorePoints} margin={MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis {...xAxisProps(scorePoints, c)} />
          <YAxis yAxisId="diff" {...AXIS} />
          {hasFallback && <YAxis yAxisId="svp" orientation="right" {...AXIS} />}
          <Tooltip content={<ChartTooltip />} cursor={CURSOR_LINE} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {milestoneLines(c, milestones, scorePoints, "diff")}
          <Line yAxisId="diff" type="monotone" dataKey="Differential" stroke={ACCENT} strokeWidth={1}
            strokeOpacity={0.5} dot={{ r: 2, fill: ACCENT }} activeDot={{ r: 4 }} connectNulls />
          <Line yAxisId="diff" type="monotone" dataKey="5-round avg" stroke={ACCENT} strokeWidth={2.5}
            dot={false} activeDot={{ r: 5 }} connectNulls />
          {hasFallback && (
            <Line yAxisId="svp" type="monotone" dataKey="Strokes vs Par / hole" stroke={FALLBACK}
              strokeWidth={1.5} strokeDasharray="5 4" dot={{ r: 2, fill: FALLBACK }} activeDot={{ r: 4 }} connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>
    )
  } else if (metric === "putts") {
    summary = puttsAvg != null ? `Average ${puttsAvg.toFixed(2)} putts per hole · last ${Math.min(RECENT, puttsPoints.length)} rounds ${puttsRecent!.toFixed(2)}` : ""
    caption = `Based on ${puttsPoints.length} of ${rounds.length} rounds with putts logged. Per-hole rates so 9- and 18-hole rounds compare directly.`
    body = puttsPoints.length === 0 ? (
      <Empty>No putts logged yet.</Empty>
    ) : (
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={puttsPoints} margin={MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis {...xAxisProps(puttsPoints, c)} />
          <YAxis yAxisId="pph" {...AXIS} />
          <YAxis yAxisId="rate" orientation="right" {...AXIS} unit="%" />
          <Tooltip content={<ChartTooltip />} cursor={CURSOR_FILL} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          {milestoneLines(c, milestones, puttsPoints, "pph")}
          <Bar yAxisId="pph" dataKey="Putts / hole" fill={ACCENT} fillOpacity={0.7} radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Line yAxisId="rate" type="monotone" dataKey="3-Putt %" stroke={ORANGE} strokeWidth={2} connectNulls
            dot={{ r: 3, fill: ORANGE }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    )
  } else {
    const isFw = metric === "fairways"
    const points: { rawDate: string; date: string; i: number; [k: string]: string | number }[] = isFw ? fairwayPoints : girPoints
    const key = isFw ? "Fairways %" : "GIR %"
    const color = isFw ? ACCENT : BLUE
    const a = isFw ? fairwayAvg : girAvg
    const recent = isFw ? fairwayRecent : girRecent
    summary = a != null ? `Average ${pct(a)} · last ${Math.min(RECENT, points.length)} rounds ${pct(recent)}` : ""
    caption = `Based on ${points.length} of ${rounds.length} rounds with this data logged.`
    body = points.length === 0 ? (
      <Empty>No {isFw ? "fairways" : "greens"} logged yet.</Empty>
    ) : (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis {...xAxisProps(points, c)} />
          <YAxis {...AXIS} domain={[0, 100]} unit="%" />
          <Tooltip content={<ChartTooltip />} cursor={CURSOR_LINE} />
          {milestoneLines(c, milestones, points)}
          <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} connectNulls
            dot={{ r: 2.5, fill: color }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <TrendingUp size={15} className="text-accent" />
          <span className="label-xs">Trends</span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {rounds.length} round{rounds.length !== 1 ? "s" : ""}
          <ChevronDown size={13} className={["transition-transform", open ? "rotate-180" : ""].join(" ")} />
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <div className="relative">
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              aria-label="Trend to show"
              className="w-full appearance-none rounded-lg border border-fg/[0.08] bg-surface-3 py-2.5 pl-3 pr-9 text-sm font-medium text-fg focus:border-accent focus:outline-none"
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>

          <p className="mt-3 flex min-h-[1rem] items-center gap-1.5 text-xs text-fg-3">
            {summary}
            {caption && <InfoTip label="How this chart works">{caption}</InfoTip>}
          </p>
          <div className="mt-2">{body}</div>

          <MilestoneManager milestones={milestones} />
        </div>
      )}
    </div>
  )
}
