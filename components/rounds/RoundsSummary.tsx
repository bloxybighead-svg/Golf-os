import type { Round } from "@/lib/supabase/types"

function startOfMonthISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
}

function avg(nums: number[]) {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

// Rounds' hero number plus a supporting row. Renders nothing without rounds
// (the page shows its "No rounds yet" state instead).
export function RoundsSummary({ rounds }: { rounds: Round[] }) {
  const monthStart = startOfMonthISO()
  const roundsThisMonth = rounds.filter((r) => r.date >= monthStart).length

  const scores = rounds.map((r) => r.score - r.par)
  const avgScoreRel = avg(scores)

  const diffs = rounds.filter((r) => r.differential != null).map((r) => r.differential as number)
  const avgDiff = avg(diffs)

  const compDiffs = rounds.filter((r) => r.is_competitive && r.differential != null).map((r) => r.differential as number)
  const avgCompDiff = avg(compDiffs)

  const pracDiffs = rounds.filter((r) => !r.is_competitive && r.differential != null).map((r) => r.differential as number)
  const avgPracDiff = avg(pracDiffs)

  const penPerHole = rounds
    .filter((r) => r.penalties != null)
    .map((r) => (r.penalties as number) / (r.holes_played || 18))
  const avgPenPerHole = avg(penPerHole)

  const fwPcts = rounds.filter((r) => r.fairways_pct != null).map((r) => r.fairways_pct as number)
  const avgFairways = avg(fwPcts)

  const girPcts = rounds.filter((r) => r.gir_pct != null).map((r) => r.gir_pct as number)
  const avgGir = avg(girPcts)

  function scoreLabel(rel: number) {
    if (rel === 0) return "E"
    return rel > 0 ? `+${rel.toFixed(1)}` : rel.toFixed(1)
  }

  // One hero number: average differential (it puts 9- and 18-hole rounds and
  // every course on one scale), or average score to par when no round has a
  // rating/slope yet. Everything else is a small supporting stat, shown only
  // when there's data for it, so an empty account never shows a row of dashes.
  const hero =
    avgDiff != null
      ? {
          label: "Average differential",
          value: avgDiff.toFixed(1),
          sub: [
            `${diffs.length} rated round${diffs.length === 1 ? "" : "s"}`,
            ...(avgCompDiff != null ? [`competitive ${avgCompDiff.toFixed(1)}`] : []),
            ...(avgPracDiff != null ? [`practice ${avgPracDiff.toFixed(1)}`] : []),
          ].join(" · "),
        }
      : avgScoreRel != null
        ? { label: "Average score", value: scoreLabel(avgScoreRel), sub: "to par" }
        : null

  const supporting: { label: string; value: string }[] = [
    { label: "This month", value: String(roundsThisMonth) },
    ...(avgDiff != null && avgScoreRel != null ? [{ label: "Avg score", value: scoreLabel(avgScoreRel) }] : []),
    ...(avgFairways != null ? [{ label: "Fairways", value: `${avgFairways.toFixed(0)}%` }] : []),
    ...(avgGir != null ? [{ label: "Greens", value: `${avgGir.toFixed(0)}%` }] : []),
    ...(avgPenPerHole != null ? [{ label: "Penalties / hole", value: avgPenPerHole.toFixed(2) }] : []),
  ]

  return hero ? (
    <section>
      <p className="label-xs">{hero.label}</p>
      <p className="mt-1 text-5xl font-semibold leading-none tracking-tight text-fg tabular-nums">{hero.value}</p>
      <p className="mt-2 text-xs text-muted">{hero.sub}</p>
      <dl className="mt-4 grid grid-cols-3 gap-y-3 border-y border-fg/[0.08] py-3 sm:grid-cols-5">
        {supporting.map((s) => (
          <div key={s.label}>
            <dt className="text-[11px] uppercase tracking-wide text-muted">{s.label}</dt>
            <dd className="text-lg font-semibold text-fg tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  ) : null

}
