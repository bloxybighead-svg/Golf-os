import { createClient } from "@/lib/supabase/server"
import { SubPageHeader } from "@/components/you/SubPageHeader"

const MINUTE_MS = 60_000

interface RunRow {
  id: string
  run_date: string
  location: string
  started_at: string
  ended_at: string | null
}

export default async function OlderSessionsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("practice_runs")
    .select("id, run_date, location, started_at, ended_at")
    .neq("status", "running")
    .order("started_at", { ascending: false })
  const runs = (data ?? []) as RunRow[]

  return (
    <div className="space-y-6 pt-4">
      <SubPageHeader title="Older sessions" back={{ href: "/you/practice", label: "Practice" }} />
      {runs.length === 0 ? (
        <p className="text-sm text-fg-3">None.</p>
      ) : (
        <ul className="divide-y divide-fg/[0.06]">
          {runs.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
              <span className="text-fg">{r.run_date}</span>
              <span className="min-w-0 flex-1 truncate text-fg-2">{r.location.replaceAll(",", ", ")}</span>
              <span className="shrink-0 text-muted">
                {r.ended_at ? `${Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / MINUTE_MS)} min` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
