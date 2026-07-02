import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Clock, Target, Star } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { DeleteSessionButton } from "@/components/log/DeleteSessionButton"
import { ClubWorkSection } from "@/components/log/ClubWorkSection"
import type { SessionBlock, BlockActivity, ClubWorkEntry } from "@/lib/supabase/types"

function formatDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  })
}

function FeelDots({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={[
            "h-2 w-2 rounded-full",
            n <= value ? "bg-[#22c55e]" : "bg-[#2a2a2a]",
          ].join(" ")}
        />
      ))}
    </div>
  )
}

const BLOCK_TYPE_COLORS: Record<string, string> = {
  "Full Swing":        "border-blue-500/30 bg-blue-500/5",
  "Wedge/Scoring Zone":"border-yellow-500/30 bg-yellow-500/5",
  "Chipping":          "border-orange-500/30 bg-orange-500/5",
  "Bunker":            "border-amber-500/30 bg-amber-500/5",
  "Putting":           "border-green-500/30 bg-green-500/5",
}

const BLOCK_TYPE_LABEL_COLORS: Record<string, string> = {
  "Full Swing":        "text-blue-400",
  "Wedge/Scoring Zone":"text-yellow-400",
  "Chipping":          "text-orange-400",
  "Bunker":            "text-amber-400",
  "Putting":           "text-green-400",
}

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [{ data: session, error }, { data: blocks }] = await Promise.all([
    supabase
      .from("practice_sessions")
      .select("*")
      .eq("id", params.id)
      .single(),
    supabase
      .from("session_blocks")
      .select("*")
      .eq("session_id", params.id)
      .order("created_at", { ascending: true }),
  ])

  if (error || !session) notFound()

  const sessionBlocks = (blocks ?? []) as (SessionBlock & {
    id: string
    session_id: string
    created_at: string
  })[]

  const totalShots = sessionBlocks.reduce((sum, b) => sum + (b.shot_count ?? 0), 0)
  const totalActivities = sessionBlocks.reduce((sum, b) => sum + (b.activities?.length ?? 0), 0)

  return (
    <div className="space-y-8">

      {/* Back nav */}
      <Link
        href="/log"
        className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-white transition-colors"
      >
        <ArrowLeft size={14} />
        Practice Log
      </Link>

      {/* Session header */}
      <div className="rounded-xl border border-white/[0.06] bg-[#111111] px-6 py-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xl font-bold tracking-tight text-white">{session.session_type}</p>
            <p className="mt-1 text-sm text-[#6b7280]">{formatDate(session.date)}</p>
          </div>
          <DeleteSessionButton sessionId={session.id} redirectTo="/log" />
        </div>

        {session.primary_goal && (
          <p className="mt-3 text-sm italic text-[#6b7280]">"{session.primary_goal}"</p>
        )}

        {/* Meta chips */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {session.duration_minutes && (
            <div className="flex items-center gap-1.5 text-xs text-[#6b7280]">
              <Clock size={12} />
              <span>{session.duration_minutes} min</span>
            </div>
          )}
          {session.overall_feel != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6b7280]">Feel</span>
              <FeelDots value={session.overall_feel} />
            </div>
          )}
          {session.energy_level != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6b7280]">Energy</span>
              <FeelDots value={session.energy_level} />
            </div>
          )}
        </div>

        {/* Location chips */}
        {session.location?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
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

        {/* Quick stats */}
        {(totalShots > 0 || totalActivities > 0 || sessionBlocks.length > 0) && (
          <div className="mt-4 flex gap-6 border-t border-white/[0.04] pt-4">
            <div>
              <p className="text-lg font-bold text-white">{sessionBlocks.length}</p>
              <p className="text-xs text-[#6b7280]">{sessionBlocks.length === 1 ? "block" : "blocks"}</p>
            </div>
            {totalActivities > 0 && (
              <div>
                <p className="text-lg font-bold text-white">{totalActivities}</p>
                <p className="text-xs text-[#6b7280]">{totalActivities === 1 ? "activity" : "activities"}</p>
              </div>
            )}
            {totalShots > 0 && (
              <div>
                <p className="text-lg font-bold text-white">{totalShots}</p>
                <p className="text-xs text-[#6b7280]">shots</p>
              </div>
            )}
          </div>
        )}

        {session.notes && (
          <p className="mt-4 border-t border-white/[0.04] pt-4 text-sm text-[#9ca3af]">
            {session.notes}
          </p>
        )}
      </div>

      {/* Blocks */}
      {sessionBlocks.length === 0 ? (
        <p className="text-sm text-[#4b5563]">No blocks recorded for this session.</p>
      ) : (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[#6b7280]">Blocks</h2>
          {sessionBlocks.map((block, idx) => {
            const colorBorder = BLOCK_TYPE_COLORS[block.block_type] ?? "border-white/[0.06] bg-transparent"
            const labelColor = BLOCK_TYPE_LABEL_COLORS[block.block_type] ?? "text-white"
            const activities: BlockActivity[] = block.activities ?? []

            return (
              <div
                key={block.id ?? idx}
                className={["rounded-xl border px-5 py-4 shadow-sm", colorBorder].join(" ")}
              >
                {/* Block header */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className={["text-sm font-semibold", labelColor].join(" ")}>
                      {block.block_type}
                    </span>
                    {block.duration_minutes && (
                      <span className="text-xs text-[#4b5563]">{block.duration_minutes} min</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {block.quality_rating != null && (
                      <div className="flex items-center gap-1">
                        <Star size={11} className="text-[#22c55e]" fill="#22c55e" />
                        <span className="text-xs font-semibold text-[#22c55e]">{block.quality_rating}/5</span>
                      </div>
                    )}
                    {block.shot_count != null && (
                      <span className="text-xs text-[#6b7280]">{block.shot_count} shots</span>
                    )}
                    {block.launch_pro && (
                      <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                        LaunchPro
                      </span>
                    )}
                  </div>
                </div>

                {/* Clubs */}
                {block.clubs_used?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {block.clubs_used.map((club) => (
                      <span
                        key={club}
                        className="rounded-md border border-white/[0.06] bg-[#1a1a1a] px-2 py-0.5 text-xs text-[#9ca3af]"
                      >
                        {club}
                      </span>
                    ))}
                  </div>
                )}

                {/* Distance range */}
                {block.distance_range && (
                  <p className="mt-2 text-xs text-[#6b7280]">
                    <Target size={11} className="mr-1 inline" />
                    {block.distance_range}
                  </p>
                )}

                {/* Activities */}
                {activities.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-white/[0.04] pt-3">
                    {activities.map((act, aIdx) => (
                      <div key={aIdx} className="flex items-start gap-3">
                        <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#374151]" />
                        <div className="min-w-0">
                          <span className="text-sm text-white">{act.drill_name}</span>
                          {act.rep_count != null && (
                            <span className="ml-2 text-xs text-[#4b5563]">× {act.rep_count}</span>
                          )}
                          {act.note && (
                            <p className="mt-0.5 text-xs italic text-[#6b7280]">{act.note}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Block notes */}
                {block.notes && (
                  <p className="mt-3 border-t border-white/[0.04] pt-2.5 text-xs italic text-[#6b7280]">
                    {block.notes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Club Work — editable */}
      <ClubWorkSection
        sessionId={session.id}
        initial={(session.club_work ?? []) as ClubWorkEntry[]}
      />
    </div>
  )
}
