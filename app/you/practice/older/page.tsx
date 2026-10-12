import { createClient } from "@/lib/supabase/server"
import { SubPageHeader } from "@/components/you/SubPageHeader"
import type { PracticeSession } from "@/lib/supabase/types"

export default async function OlderSessionsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("practice_sessions")
    .select("id, date, session_type, duration_minutes")
    .order("date", { ascending: false })
  const sessions = (data ?? []) as PracticeSession[]

  return (
    <div className="space-y-6 pt-4">
      <SubPageHeader title="Older sessions" back={{ href: "/you/practice", label: "Practice" }} />
      {sessions.length === 0 ? (
        <p className="text-sm text-fg-3">None.</p>
      ) : (
        <ul className="divide-y divide-fg/[0.06]">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
              <span className="tabular-nums text-fg">{s.date}</span>
              <span className="min-w-0 flex-1 truncate text-fg-2">{s.session_type}</span>
              <span className="shrink-0 tabular-nums text-muted">{s.duration_minutes != null ? `${s.duration_minutes} min` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
