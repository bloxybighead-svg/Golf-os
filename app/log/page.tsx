import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export default async function LogPage() {
  const supabase = createClient()

  const { data: sessions, error } = await supabase
    .from("practice_sessions")
    .select("id, date, session_type, primary_goal, overall_feel, duration_minutes, location")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30)

  const sessionList = error ? [] : (sessions ?? [])

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Practice Log</h2>
          <p className="text-xs text-[#6b7280]">
            {sessionList.length === 0 ? "No sessions yet" : `${sessionList.length} session${sessionList.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link
          href="/log/new"
          className="rounded-md bg-[#4ade80] px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          + New Session
        </Link>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md border border-yellow-800 bg-yellow-950/40 px-4 py-3 text-xs text-yellow-400">
          <p className="font-medium">Supabase not connected</p>
          <p className="mt-0.5 text-yellow-600">
            Run the schema SQL and check your .env.local keys to load sessions.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!error && sessionList.length === 0 && (
        <div className="rounded-md border border-dashed border-[#2a2a2a] py-16 text-center">
          <p className="text-sm text-[#6b7280]">No sessions logged yet.</p>
          <p className="mt-1 text-xs text-[#6b7280]">Hit the range and log your first one.</p>
        </div>
      )}

      {/* Session list */}
      <div className="space-y-2">
        {sessionList.map((session: {
          id: string
          date: string
          session_type: string
          primary_goal: string | null
          overall_feel: number | null
          duration_minutes: number | null
          location: string[]
        }) => (
          <div
            key={session.id}
            className="rounded-md border border-[#2a2a2a] bg-[#161616] px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{session.session_type}</p>
                <p className="text-xs text-[#6b7280]">
                  {formatDate(session.date)}
                  {session.duration_minutes ? ` · ${session.duration_minutes} min` : ""}
                </p>
              </div>
              {session.overall_feel != null && (
                <span className="shrink-0 text-xs font-semibold text-[#4ade80]">
                  {session.overall_feel}/5
                </span>
              )}
            </div>
            {session.primary_goal && (
              <p className="mt-1.5 text-xs italic text-[#6b7280]">"{session.primary_goal}"</p>
            )}
            {session.location?.length > 0 && (
              <p className="mt-1 text-xs text-[#6b7280]">{session.location.join(" + ")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
