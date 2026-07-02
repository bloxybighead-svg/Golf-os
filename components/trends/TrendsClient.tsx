"use client"

import { useState, useTransition } from "react"
import { TrendingDown, Plus, X, Download } from "lucide-react"
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine,
} from "recharts"
import type { Round, Milestone, PracticeSession } from "@/lib/supabase/types"
import { createMilestone, deleteMilestone } from "@/app/trends/actions"

type Filter = "all" | "competitive" | "practice"

const ACCENT = "#22c55e"
const BLUE = "#60a5fa"
const PURPLE = "#a78bfa"
const ORANGE = "#fb923c"
const FALLBACK = "#9ca3af"

function shortDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

// Differentials off a partial-round rating are on a smaller scale, so scale
// them up to an 18-hole basis by 18 / holes_played (exactly ×2 for a 9-hole
// round, ×1.29 for a 14-hole round). Approximation — not the official GHIN conversion.
function normalizedDiff(r: Round): number | null {
  if (r.differential == null) return null
  return r.holes_played > 0 && r.holes_played < 18
    ? r.differential * (18 / r.holes_played)
    : r.differential
}

// ── CSV export ────────────────────────────────────────────────────
function csvCell(value: unknown): string {
  if (value == null) return ""
  const s = Array.isArray(value) ? value.join("; ") : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const lines = [headers.join(",")]
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(","))
  }
  return lines.join("\r\n")
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: "all",         label: "All Rounds"       },
  { value: "competitive", label: "Competitive Only"  },
  { value: "practice",    label: "Practice Only"     },
]

// Map a milestone date to the nearest round label present on a given chart's x-axis.
function nearestLabel(msISO: string, points: { rawDate: string; date: string }[]): string | null {
  if (points.length === 0) return null
  const m = new Date(msISO + "T12:00:00").getTime()
  let best = points[0], bestDiff = Infinity
  for (const p of points) {
    const d = Math.abs(new Date(p.rawDate + "T12:00:00").getTime() - m)
    if (d < bestDiff) { bestDiff = d; best = p }
  }
  return best.date
}

// ── UI primitives ────────────────────────────────────────────────
function Card({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-5 shadow-sm">
      <p className="label-xs mb-4">{title}</p>
      {children}
      {caption && <p className="mt-3 text-xs text-[#4b5563]">{caption}</p>}
    </div>
  )
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/[0.1] bg-[#1a1a1a] px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-medium text-white">{label}</p>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <p key={p.name} className="text-xs" style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

const AXIS_PROPS = {
  stroke: "#4b5563",
  tick: { fill: "#6b7280", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "#ffffff14" },
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
      <p className="label-xs mb-2">{label}</p>
      <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-[#6b7280]">{sub}</p>}
    </div>
  )
}

function NotEnough() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111111] py-20 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1a1a1a] shadow-lg shadow-[#22c55e]/20 ring-1 ring-[#22c55e]/20">
        <TrendingDown size={22} className="text-[#22c55e]" />
      </div>
      <p className="text-base font-semibold text-white">Not enough rounds yet for this view</p>
      <p className="mt-1.5 text-sm text-[#6b7280]">Log at least 3 rounds in this filter to see trends.</p>
    </div>
  )
}

// Vertical dashed milestone markers for a given chart's point set
function MilestoneLines({ milestones, points, yAxisId }: {
  milestones: Milestone[]
  points: { rawDate: string; date: string }[]
  yAxisId?: string
}) {
  return (
    <>
      {milestones.map((ms) => {
        const lbl = nearestLabel(ms.date, points)
        if (!lbl) return null
        return (
          <ReferenceLine
            key={ms.id}
            x={lbl}
            {...(yAxisId ? { yAxisId } : {})}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{ value: ms.label, position: "insideTopRight", fill: "#9ca3af", fontSize: 10 }}
          />
        )
      })}
    </>
  )
}

// ── Milestone manager ─────────────────────────────────────────────
function MilestoneManager({ milestones }: { milestones: Milestone[] }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [label, setLabel] = useState("")
  const [isPending, startTransition] = useTransition()

  function add() {
    if (!label.trim() || !date) return
    startTransition(async () => {
      await createMilestone(date, label)
      setLabel("")
    })
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="label-xs">Milestone Markers</p>
          <p className="mt-1 text-xs text-[#6b7280]">
            {milestones.length === 0
              ? "Tag swing/equipment changes to see their effect on trends"
              : `${milestones.length} marker${milestones.length !== 1 ? "s" : ""} on charts`}
          </p>
        </div>
        <span className="text-xs text-[#6b7280]">{open ? "Hide" : "Manage"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/[0.04] pt-4">
          {/* Add form */}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-[#6b7280]">Date</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-[#22c55e] focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="mb-1 block text-xs text-[#6b7280]">Label</label>
              <input
                type="text" value={label} onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="e.g. Grip Fix"
                className="w-full rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder:text-[#4b5563] focus:border-[#22c55e] focus:outline-none"
              />
            </div>
            <button
              onClick={add}
              disabled={!label.trim() || isPending}
              className="flex items-center gap-1.5 rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-semibold text-black transition-all hover:brightness-110 disabled:opacity-30"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Existing markers */}
          {milestones.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {milestones.map((ms) => (
                <span
                  key={ms.id}
                  className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#1a1a1a] px-3 py-1 text-xs text-[#9ca3af]"
                >
                  <span className="text-[#6b7280]">{shortDate(ms.date)}</span>
                  <span className="font-medium text-white">{ms.label}</span>
                  <button
                    onClick={() => startTransition(async () => { await deleteMilestone(ms.id) })}
                    className="text-[#6b7280] hover:text-red-400"
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
  rounds: Round[]
  sessions: PracticeSession[]
  milestones: Milestone[]
}

export function TrendsClient({ rounds, sessions, milestones }: Props) {
  const [filter, setFilter] = useState<Filter>("all")

  function exportData() {
    const stamp = new Date().toISOString().split("T")[0]
    if (rounds.length > 0) {
      downloadCSV(`golf-os-rounds-${stamp}.csv`, toCSV(rounds as unknown as Record<string, unknown>[]))
    }
    if (sessions.length > 0) {
      downloadCSV(`golf-os-sessions-${stamp}.csv`, toCSV(sessions as unknown as Record<string, unknown>[]))
    }
  }

  const filtered = rounds.filter((r) => {
    if (filter === "competitive") return r.is_competitive
    if (filter === "practice")   return !r.is_competitive
    return true
  })

  // ── Differential (normalized) + rolling avg + fallback ──────────
  const diffSeq: number[] = []
  const diffPoints = filtered.map((r) => {
    const norm = normalizedDiff(r)
    let roll: number | null = null
    if (norm != null) {
      diffSeq.push(norm)
      roll = r1(avg(diffSeq.slice(-5))!)
    }
    // Fallback for rounds with no rating/slope: strokes vs par per hole
    const svp = r.differential == null && r.holes_played > 0
      ? r2((r.score - r.par) / r.holes_played)
      : null
    return {
      rawDate: r.date,
      date: shortDate(r.date),
      Differential: norm != null ? r1(norm) : null,
      "5-round avg": roll,
      "Strokes vs Par / hole": svp,
    }
  })
  const hasFallback = diffPoints.some((p) => p["Strokes vs Par / hole"] != null)
  const diffCount = diffPoints.filter((p) => p.Differential != null).length

  const normDiffs = filtered.map(normalizedDiff).filter((n): n is number => n != null)
  const avgDiff = avg(normDiffs)
  const hasPartial = filtered.some((r) => r.differential != null && r.holes_played < 18)

  // ── Fairways / GIR ──────────────────────────────────────────────
  const fwGirRounds = filtered.filter((r) => r.fairways_pct != null || r.gir_pct != null)
  const fwGirPoints = fwGirRounds.map((r) => ({
    rawDate: r.date,
    date: shortDate(r.date),
    "Fairways %": r.fairways_pct,
    "GIR %": r.gir_pct,
  }))

  // ── Putts (per-hole rates) ──────────────────────────────────────
  const puttsRounds = filtered.filter((r) => r.total_putts != null && r.holes_played > 0)
  const puttsPoints = puttsRounds.map((r) => ({
    rawDate: r.date,
    date: shortDate(r.date),
    "Putts / hole": r2((r.total_putts as number) / r.holes_played),
    "3-Putt %": r.three_putts != null ? r1((r.three_putts / r.holes_played) * 100) : null,
  }))
  const avgPuttsPerHole = avg(puttsRounds.map((r) => (r.total_putts as number) / r.holes_played))

  // ── Sessions this month (unaffected by round filter) ────────────
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const sessionsThisMonth = sessions.filter((s) => s.date >= monthStart).length

  // ── Practice frequency — last 8 weeks ───────────────────────────
  const weekBuckets: { label: string; sessions: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const end = new Date(now); end.setDate(end.getDate() - i * 7)
    const start = new Date(end); start.setDate(start.getDate() - 6)
    const startISO = start.toISOString().split("T")[0]
    const endISO = end.toISOString().split("T")[0]
    weekBuckets.push({
      label: start.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
      sessions: sessions.filter((s) => s.date >= startISO && s.date <= endISO).length,
    })
  }

  const filterSub = filter === "all" ? "all rounds" : filter === "competitive" ? "competitive" : "practice"
  const enoughRounds = filtered.length >= 3

  return (
    <div className="space-y-8">

      {/* Header + filter */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Trends</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            {filtered.length} round{filtered.length !== 1 ? "s" : ""} in view
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
            {FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={[
                  "px-4 py-2 text-xs font-medium transition-colors",
                  filter === value ? "bg-[#22c55e] text-black" : "bg-[#1a1a1a] text-[#6b7280] hover:text-white",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={exportData}
            disabled={rounds.length === 0 && sessions.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-4 py-2 text-xs font-medium text-[#9ca3af] transition-colors hover:text-white hover:border-white/20 disabled:opacity-30"
          >
            <Download size={13} />
            Export Data
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Rounds Logged" value={`${filtered.length}`} sub={filterSub} />
        <StatCard
          label="Avg Differential"
          value={avgDiff != null ? avgDiff.toFixed(1) : "—"}
          sub={avgDiff != null ? (hasPartial ? "scaled to 18 holes" : "USGA-style") : "add rating/slope"}
        />
        <StatCard
          label="Putts / Hole"
          value={avgPuttsPerHole != null ? avgPuttsPerHole.toFixed(2) : "—"}
          sub={avgPuttsPerHole != null ? `${puttsRounds.length} rounds` : "no data yet"}
        />
        <StatCard label="Sessions This Month" value={`${sessionsThisMonth}`} sub="from Practice Log" />
      </div>

      {/* Milestone manager */}
      <MilestoneManager milestones={milestones} />

      {/* Charts */}
      {!enoughRounds ? (
        <NotEnough />
      ) : (
        <div className="space-y-4">

          {/* 1. Score Differential over time */}
          <Card
            title="Score Differential over time"
            caption={`${diffCount} of ${filtered.length} rounds have rating/slope. Differential normalized: partial rounds scaled to an 18-hole basis (×18/holes — e.g. ×2 for 9 holes, ×1.29 for 14) for comparison (approximation, not official GHIN).${hasFallback ? " Grey line = Strokes vs Par per hole (right axis) for rounds without rating/slope." : ""}`}
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={diffPoints} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis dataKey="date" {...AXIS_PROPS} />
                <YAxis yAxisId="diff" {...AXIS_PROPS} />
                {hasFallback && (
                  <YAxis yAxisId="svp" orientation="right" {...AXIS_PROPS} />
                )}
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#ffffff14" }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#6b7280" }} />
                <MilestoneLines milestones={milestones} points={diffPoints} yAxisId="diff" />
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
          </Card>

          {/* 2. Fairways % & GIR % over time */}
          <Card
            title="Fairways % and GIR % over time"
            caption={`Based on ${fwGirRounds.length} of ${filtered.length} rounds with this data logged`}
          >
            {fwGirPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={fwGirPoints} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="date" {...AXIS_PROPS} />
                  <YAxis {...AXIS_PROPS} domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#ffffff14" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#6b7280" }} />
                  <MilestoneLines milestones={milestones} points={fwGirPoints} />
                  <Line type="monotone" dataKey="Fairways %" stroke={ACCENT} strokeWidth={2} connectNulls
                    dot={{ r: 2.5, fill: ACCENT }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="GIR %" stroke={BLUE} strokeWidth={2} connectNulls
                    dot={{ r: 2.5, fill: BLUE }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-[#4b5563]">No fairway/GIR data in this filter.</p>
            )}
          </Card>

          {/* 3. Putts / hole & 3-Putt rate */}
          <Card
            title="Putts per hole and 3-Putt rate"
            caption={`Based on ${puttsRounds.length} of ${filtered.length} rounds with this data logged. Per-hole rates so 9- and 18-hole rounds compare directly.`}
          >
            {puttsPoints.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={puttsPoints} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="date" {...AXIS_PROPS} />
                  <YAxis yAxisId="pph" {...AXIS_PROPS} />
                  <YAxis yAxisId="rate" orientation="right" {...AXIS_PROPS} unit="%" />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#6b7280" }} />
                  <Bar yAxisId="pph" dataKey="Putts / hole" fill={ACCENT} fillOpacity={0.7} radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="rate" type="monotone" dataKey="3-Putt %" stroke={ORANGE} strokeWidth={2} connectNulls
                    dot={{ r: 3, fill: ORANGE }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-[#4b5563]">No putting data in this filter.</p>
            )}
          </Card>

          {/* 4. Practice frequency — last 8 weeks */}
          <Card title="Practice frequency — last 8 weeks" caption="Sessions per week from the Practice Log">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekBuckets} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis dataKey="label" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="sessions" name="Sessions" fill={PURPLE} fillOpacity={0.8} radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

        </div>
      )}
    </div>
  )
}
