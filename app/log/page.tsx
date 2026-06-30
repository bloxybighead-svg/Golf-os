import Link from "next/link"
import { Flag } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { DeleteSessionButton } from "@/components/log/DeleteSessionButton"

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function startOfWeekISO() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split("T")[0]
}

export default async function LogPage() {
  const supabase = createClient()

  const [{ data: sessions, error }, { data: blocks }] = await Promise.all([
    supabase
      .from("practice_sessions")
      .select("id, date, session_type, primary_goal, overall_feel, duration_minutes, location")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("session_blocks")
      .select("session_id, shot_count"),
  ])

  const sessionList = error ? [] : (sessions ?? [])

  // Stat: sessions this week
  const weekStart = startOfWeekISO()
  const sessionsThisWeek = sessionList.filter((s: { date: string }) => s.date >= weekStart).length

  // Stat: last session
  const lastSession = sessionList[0] ?? null

  // Stat: avg shots per session
  const perSession: Record<string, number> = {}
  for (const b of blocks ?? []) {
    if (b.shot_count) {
      perSession[b.session_id] = (perSession[b.session_id] ?? 0) + b.shot_count
    }
  }
  const totals = Object.values(perSession)
  const avgShots = totals.length > 0
    ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)
    : null

  return (
    <div className="space-y-8">

      {/* ── Stats row ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">This Week</p>
          <p className="text-3xl font-bold tracking-tight text-white">
            {sessionsThisWeek}
          </p>
          <p className="mt-1 text-xs text-[#6b7280]">
            {sessionsThisWeek === 1 ? "session" : "sessions"}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Last Session</p>
          <p className="text-sm font-semibold text-white">
            {lastSession ? formatDate(lastSession.date) : "—"}
          </p>
          {lastSession
            ? <p className="mt-1 text-xs text-[#6b7280] truncate">{lastSession.session_type}</p>
            : <p className="mt-1 text-xs text-[#4b5563]">No sessions yet</p>
          }
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm">
          <p className="label-xs mb-2">Avg Shots / Session</p>
          <p className="text-3xl font-bold tracking-tight text-white">
            {avgShots ?? "—"}
          </p>
          <p className="mt-1 text-xs text-[#6b7280]">across all blocks</p>
        </div>
      </div>

      {/* ── Header row ────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Practice Log</h2>
          <p className="mt-1 text-sm text-[#6b7280]">
            {sessionList.length === 0
              ? "No sessions logged yet"
              : `${sessionList.length} session${sessionList.length !== 1 ? "s" : ""} logged`}
          </p>
        </div>
        <Link
          href="/log/new"
          className="flex items-center gap-2 rounded-lg bg-[#22c55e] px-5 py-2.5 text-sm font-semibold text-black shadow-md shadow-[#22c55e]/20 transition-all hover:brightness-110 hover:scale-[1.03] active:scale-[0.97]"
        >
          <span className="text-base leading-none">+</span>
          <span>New Session</span>
        </Link>
      </div>

      {/* ── Error state ───────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-yellow-800/60 bg-yellow-950/30 px-5 py-4 text-sm text-yellow-400">
          <p className="font-semibold">Supabase not connected</p>
          <p className="mt-1 text-xs text-yellow-600">Run the schema SQL and check your .env.local keys.</p>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────── */}
      {!error && sessionList.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] py-20 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1a1a1a] shadow-lg shadow-[#22c55e]/20 ring-1 ring-[#22c55e]/20">
            <Flag size={22} className="text-[#22c55e]" />
          </div>
          <p className="text-base font-semibold text-white">No sessions logged yet</p>
          <p className="mt-1.5 text-sm text-[#6b7280]">Hit the range and log your first one.</p>
        </div>
      )}

      {/* ── Session list ──────────────────────────────────── */}
      {sessionList.length > 0 && (
        <div className="space-y-2.5">
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
              className="rounded-xl border border-white/[0.06] bg-[#111111] px-5 py-4 shadow-sm transition-colors hover:bg-[#161616]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{session.session_type}</p>
                  <p className="mt-0.5 text-xs text-[#6b7280]">
                    {formatDate(session.date)}
                    {session.duration_minutes ? ` · ${session.duration_minutes} min` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {session.overall_feel != null && (
                    <span className="text-xs font-bold text-[#22c55e]">
                      {session.overall_feel}/5
                    </span>
                  )}
                  <DeleteSessionButton sessionId={session.id} />
                </div>
              </div>
              {session.primary_goal && (
                <p className="mt-2 text-sm italic text-[#6b7280]">"{session.primary_goal}"</p>
              )}
              {session.location?.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {session.location.map((loc: string) => (
                    <span
                      key={loc}
                      className="rounded-full border border-white/[0.06] bg-[#1a1a1a] px-2.5 py-0.5 text-xs text-[#6b7280]"
                    >
                      {loc}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
