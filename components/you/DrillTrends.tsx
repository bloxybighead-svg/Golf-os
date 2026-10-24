import type { DrillTrend } from "@/lib/practice/progress"

/** A line is for this many sessions or more; fewer are shown as numbers. From the spec. */
const MIN_SESSIONS_FOR_LINE = 5

function Line({ values, label }: { values: number[]; label: string }) {
  const lo = Math.min(...values)
  const span = Math.max(...values) - lo || 1
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${22 - ((v - lo) / span) * 20}`).join(" ")
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={label} className="h-6 w-24 shrink-0 text-accent">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Each drill scored 3+ times: its last 5 scores and its level. */
export function DrillTrends({ trends }: { trends: DrillTrend[] }) {
  if (trends.length === 0) return null
  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <p className="label-xs">Drills</p>
      <ul className="mt-1 divide-y divide-fg/[0.06]">
        {trends.map((t) => (
          <li key={t.drillId} className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-fg">{t.name}</span>
              <span className="block text-xs text-muted">
                {t.level ? `${t.level} · ` : ""}
                {t.lowerIsBetter ? "lower is better" : "higher is better"}
              </span>
            </span>
            {t.sessions >= MIN_SESSIONS_FOR_LINE ? (
              <Line values={t.values} label={`${t.name}: ${t.values.join(", ")}`} />
            ) : (
              <span className="shrink-0 tabular-nums text-fg">{t.values.join(" · ")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
