"use client"

import { useEffect, useState, useTransition } from "react"
import { X, Clock, Repeat, Wrench } from "lucide-react"
import type { LibraryDrill } from "@/lib/supabase/types"
import { CATEGORY_LABEL } from "@/lib/drillRecommendations"
import { startDrill, completeDrill } from "@/app/drills/library-actions"

type Phase = "ready" | "running" | "finishing"

function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function DrillModal({
  drill,
  signedIn,
  onClose,
  onCompleted,
}: {
  drill: LibraryDrill
  signedIn: boolean
  onClose: () => void
  onCompleted: () => void
}) {
  const [phase, setPhase] = useState<Phase>("ready")
  const [runId, setRunId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [reps, setReps] = useState(drill.reps_suggested != null ? String(drill.reps_suggested) : "")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (phase !== "running") return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [phase])

  function start() {
    setError(null)
    startTransition(async () => {
      try {
        const id = await startDrill(drill.id)
        setRunId(id)
        setStartedAt(Date.now())
        setNow(Date.now())
        setPhase("running")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start the drill.")
      }
    })
  }

  function save() {
    if (!runId) return
    const parsedReps = reps.trim() === "" ? null : Number(reps)
    if (parsedReps != null && (!Number.isInteger(parsedReps) || parsedReps < 0)) {
      setError("Reps must be a whole number, 0 or more.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await completeDrill(runId, parsedReps, notes.trim() || null)
        onCompleted()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the drill.")
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/70 md:items-center md:p-4"
      onClick={() => phase === "ready" && onClose()}
    >
      <div
        className="flex h-full w-full flex-col bg-[#111111] md:h-auto md:max-h-[85vh] md:max-w-md md:rounded-2xl md:border md:border-white/[0.1] md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 pb-3 pt-[calc(1rem+env(safe-area-inset-top))] md:pt-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-[#22c55e]">
              {CATEGORY_LABEL[drill.category]} · {drill.difficulty}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-white">{drill.name}</h2>
          </div>
          <button onClick={onClose} className="shrink-0 p-1 text-[#9ca3af] hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[#9ca3af]">
            {drill.reps_suggested != null && (
              <span className="flex items-center gap-1"><Repeat size={12} /> {drill.reps_suggested} reps</span>
            )}
            {drill.time_estimate_mins != null && (
              <span className="flex items-center gap-1"><Clock size={12} /> ~{drill.time_estimate_mins} min</span>
            )}
            {drill.equipment_needed && (
              <span className="flex items-center gap-1"><Wrench size={12} /> {drill.equipment_needed}</span>
            )}
          </div>

          {drill.instructions && (
            <div>
              <p className="label-xs mb-1.5">How to do it</p>
              <p className="text-sm leading-relaxed text-[#e5e5e5]">{drill.instructions}</p>
            </div>
          )}

          {phase !== "ready" && startedAt != null && (
            <div className="rounded-xl bg-[#1a1a1a] px-4 py-3 text-center">
              <p className="label-xs">Elapsed</p>
              <p className="mt-1 font-mono text-3xl font-bold text-white">{fmtElapsed(now - startedAt)}</p>
            </div>
          )}

          {phase === "finishing" && (
            <div className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#9ca3af]">Reps completed</span>
                <input
                  type="number" inputMode="numeric" min={0}
                  value={reps} onChange={(e) => setReps(e.target.value)}
                  className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:border-[#22c55e] focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[#9ca3af]">How did it go? (optional)</span>
                <textarea
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. 6/9 up-and-downs, missed the downhill ones"
                  className="resize-none rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#4b5563] focus:border-[#22c55e] focus:outline-none"
                />
              </label>
            </div>
          )}

          {!signedIn && <p className="text-xs text-yellow-500">Sign in to log drills.</p>}
          {error && (
            <p className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="shrink-0 border-t border-white/[0.06] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 md:pb-4">
          {phase === "ready" && (
            <button
              onClick={start}
              disabled={!signedIn || isPending}
              className="w-full rounded-lg bg-[#22c55e] py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110 disabled:opacity-40"
            >
              {isPending ? "Starting…" : "Start Drill"}
            </button>
          )}
          {phase === "running" && (
            <button
              onClick={() => setPhase("finishing")}
              className="w-full rounded-lg bg-[#22c55e] py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110"
            >
              Complete
            </button>
          )}
          {phase === "finishing" && (
            <button
              onClick={save}
              disabled={isPending}
              className="w-full rounded-lg bg-[#22c55e] py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110 disabled:opacity-40"
            >
              {isPending ? "Saving…" : "Save to Drill History"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
