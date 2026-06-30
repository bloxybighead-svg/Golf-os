"use client"

import { useState, useTransition } from "react"
import type { Round } from "@/lib/supabase/types"
import { createRound, updateRound } from "@/app/rounds/actions"

interface Props {
  round?: Round
  onDone: () => void
}

function todayISO() {
  return new Date().toISOString().split("T")[0]
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-[#6b7280]">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder:text-[#4b5563] focus:border-[#22c55e] focus:outline-none transition-colors"

export function RoundForm({ round, onDone }: Props) {
  const [date, setDate] = useState(round?.date ?? todayISO())
  const [course, setCourse] = useState(round?.course_name ?? "")
  const [score, setScore] = useState(round?.score?.toString() ?? "")
  const [par, setPar] = useState(round?.par?.toString() ?? "72")
  const [fwHit, setFwHit] = useState(round?.fairways_hit?.toString() ?? "")
  const [fwTotal, setFwTotal] = useState(round?.fairways_total?.toString() ?? "14")
  const [gir, setGir] = useState(round?.gir?.toString() ?? "")
  const [putts, setPutts] = useState(round?.total_putts?.toString() ?? "")
  const [notes, setNotes] = useState(round?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const relToPar = score && par ? parseInt(score) - parseInt(par) : null

  function submit() {
    if (!date || !course.trim() || !score || !par) {
      setError("Date, course, score and par are required.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const payload = {
          date,
          course_name: course.trim(),
          score: parseInt(score),
          par: parseInt(par),
          fairways_hit: fwHit ? parseInt(fwHit) : null,
          fairways_total: fwTotal ? parseInt(fwTotal) : null,
          gir: gir ? parseInt(gir) : null,
          total_putts: putts ? parseInt(putts) : null,
          notes: notes.trim() || null,
        }
        if (round) {
          await updateRound(round.id, payload)
        } else {
          await createRound(payload)
        }
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
        <button onClick={onDone} className="text-sm text-[#6b7280] hover:text-white transition-colors">
          Cancel
        </button>
        <span className="text-sm font-semibold text-white">
          {round ? "Edit Round" : "Add Round"}
        </span>
        <button
          onClick={submit}
          disabled={!course.trim() || !score || isPending}
          className="text-sm font-semibold text-[#22c55e] hover:opacity-80 disabled:opacity-30 transition-opacity"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">

        {/* Date + Course */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Course">
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. Colts Neck CC"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Score + Par */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Score (total strokes)">
            <input
              type="number"
              inputMode="numeric"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="e.g. 74"
              className={inputCls}
            />
          </Field>
          <Field label="Par">
            <input
              type="number"
              inputMode="numeric"
              value={par}
              onChange={(e) => setPar(e.target.value)}
              placeholder="72"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Relative to par preview */}
        {relToPar !== null && (
          <div className={[
            "rounded-lg px-4 py-2.5 text-sm font-semibold text-center",
            relToPar === 0
              ? "bg-[#1a1a1a] text-white"
              : relToPar < 0
              ? "bg-[#052e16] text-[#22c55e]"
              : "bg-[#1c0a09] text-[#f87171]",
          ].join(" ")}>
            {relToPar === 0 ? "Even par" : relToPar > 0 ? `+${relToPar} over par` : `${relToPar} under par`}
          </div>
        )}

        {/* Fairways */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fairways Hit">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={fwHit}
              onChange={(e) => setFwHit(e.target.value)}
              placeholder="e.g. 9"
              className={inputCls}
            />
          </Field>
          <Field label="Fairways Total">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={fwTotal}
              onChange={(e) => setFwTotal(e.target.value)}
              placeholder="14"
              className={inputCls}
            />
          </Field>
        </div>

        {/* GIR + Putts */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="GIR (out of 18)">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={18}
              value={gir}
              onChange={(e) => setGir(e.target.value)}
              placeholder="e.g. 10"
              className={inputCls}
            />
          </Field>
          <Field label="Total Putts">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={putts}
              onChange={(e) => setPutts(e.target.value)}
              placeholder="e.g. 32"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Notes */}
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How'd it go? Anything notable about the round…"
            rows={3}
            className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder:text-[#4b5563] focus:border-[#22c55e] focus:outline-none transition-colors"
          />
        </Field>

        {error && (
          <p className="rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}
