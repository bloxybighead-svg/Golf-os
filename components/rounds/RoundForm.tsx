"use client"

import { useState, useTransition } from "react"
import type { Round } from "@/lib/supabase/types"
import { BREAKDOWN_TAGS } from "@/lib/supabase/types"
import { createRound, updateRound } from "@/app/rounds/actions"

interface Props {
  round?: Round
  onDone: () => void
}

function todayISO() {
  return new Date().toISOString().split("T")[0]
}

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-[#1a1a1a] px-3 py-2.5 text-sm text-white placeholder:text-[#4b5563] focus:border-[#22c55e] focus:outline-none transition-colors"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline gap-2 text-xs font-medium uppercase tracking-widest text-[#6b7280]">
        {label}
        {hint && <span className="normal-case tracking-normal text-[#4b5563]">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function PctInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <input
        type="number" inputMode="decimal" min={0} max={100}
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls + " pr-7"}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#4b5563]">%</span>
    </div>
  )
}

function calcDifferential(score: string, courseRating: string, slopeRating: string): number | null {
  const s = parseFloat(score)
  const cr = parseFloat(courseRating)
  const sr = parseFloat(slopeRating)
  if (isNaN(s) || isNaN(cr) || isNaN(sr) || sr === 0) return null
  return Math.round(((s - cr) * 113 / sr) * 10) / 10
}

export function RoundForm({ round, onDone }: Props) {
  const [holes, setHoles] = useState(round?.holes_played?.toString() ?? "18")
  const [isCompetitive, setIsCompetitive] = useState(round?.is_competitive ?? false)
  const [breakdownTags, setBreakdownTags] = useState<string[]>(round?.breakdown_tags ?? [])
  const [date, setDate] = useState(round?.date ?? todayISO())
  const [course, setCourse] = useState(round?.course_name ?? "")
  const [score, setScore] = useState(round?.score?.toString() ?? "")
  const [par, setPar] = useState(round?.par?.toString() ?? "72")
  const [courseRating, setCourseRating] = useState(round?.course_rating?.toString() ?? "")
  const [slopeRating, setSlopeRating] = useState(round?.slope_rating?.toString() ?? "")
  const [fairwaysPct, setFairwaysPct] = useState(round?.fairways_pct?.toString() ?? "")
  const [girPct, setGirPct] = useState(round?.gir_pct?.toString() ?? "")
  const [putts, setPutts] = useState(round?.total_putts?.toString() ?? "")
  const [threePutts, setThreePutts] = useState(round?.three_putts?.toString() ?? "")
  const [upAndDowns, setUpAndDowns] = useState(round?.up_and_downs?.toString() ?? "")
  const [penalties, setPenalties] = useState(round?.penalties?.toString() ?? "")
  const [missLeft, setMissLeft] = useState(round?.miss_left_pct?.toString() ?? "")
  const [missRight, setMissRight] = useState(round?.miss_right_pct?.toString() ?? "")
  const [notes, setNotes] = useState(round?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // "None" is exclusive — it means nothing broke down, so it can't combine with a real tag
  function toggleBreakdownTag(tag: string) {
    setBreakdownTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag)
      if (tag === "None") return ["None"]
      const others = prev.filter((t) => t !== "None")
      if (others.length >= 2) return others
      return [...others, tag]
    })
  }

  const relToPar = score && par ? parseInt(score) - parseInt(par) : null
  const differential = calcDifferential(score, courseRating, slopeRating)

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
          holes_played: parseInt(holes) || 18,
          is_competitive: isCompetitive,
          breakdown_tags: isCompetitive ? breakdownTags : [],
          course_name: course.trim(),
          score: parseInt(score),
          par: parseInt(par),
          course_rating: courseRating !== "" ? parseFloat(courseRating) : null,
          slope_rating: slopeRating !== "" ? parseInt(slopeRating) : null,
          differential: calcDifferential(score, courseRating, slopeRating),
          penalties: penalties !== "" ? parseInt(penalties) : null,
          fairways_pct: fairwaysPct !== "" ? parseFloat(fairwaysPct) : null,
          gir_pct: girPct !== "" ? parseFloat(girPct) : null,
          total_putts: putts !== "" ? parseInt(putts) : null,
          three_putts: threePutts !== "" ? parseInt(threePutts) : null,
          up_and_downs: upAndDowns !== "" ? parseInt(upAndDowns) : null,
          miss_left_pct: missLeft !== "" ? parseFloat(missLeft) : null,
          miss_right_pct: missRight !== "" ? parseFloat(missRight) : null,
          notes: notes.trim() || null,
        }
        round ? await updateRound(round.id, payload) : await createRound(payload)
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
        <span className="text-sm font-semibold text-white">{round ? "Edit Round" : "Add Round"}</span>
        <button
          onClick={submit}
          disabled={!course.trim() || !score || isPending}
          className="text-sm font-semibold text-[#22c55e] hover:opacity-80 disabled:opacity-30 transition-opacity"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-5">

        {/* Date + Course + Holes + Competitive */}
        <div className="grid grid-cols-3 gap-3">
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
          <Field label="Holes Played">
            <input
              type="number" inputMode="numeric" min={1} max={18}
              value={holes} onChange={(e) => setHoles(e.target.value)}
              placeholder="18"
              className={inputCls}
            />
          </Field>
        </div>

        {/* Competitive toggle */}
        <button
          type="button"
          onClick={() => setIsCompetitive((v) => !v)}
          className={[
            "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors",
            isCompetitive
              ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-white"
              : "border-white/[0.08] bg-[#1a1a1a] text-[#6b7280] hover:text-white hover:border-white/20",
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            <div className={[
              "flex h-4 w-4 items-center justify-center rounded border transition-colors",
              isCompetitive ? "border-[#22c55e] bg-[#22c55e]" : "border-white/20 bg-transparent",
            ].join(" ")}>
              {isCompetitive && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="font-medium">Competitive Round</span>
          </div>
          {isCompetitive && (
            <span className="text-xs font-semibold text-[#22c55e]">✓ Marked competitive</span>
          )}
        </button>

        {/* What broke down — competitive rounds only, max 2 */}
        {isCompetitive && (
          <Field label="What broke down" hint="up to 2">
            <div className="flex flex-wrap gap-2">
              {BREAKDOWN_TAGS.map((tag) => {
                const selected = breakdownTags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleBreakdownTag(tag)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      selected
                        ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                        : "border-white/[0.08] bg-[#1a1a1a] text-[#6b7280] hover:text-white hover:border-white/20",
                    ].join(" ")}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          </Field>
        )}

        {/* Score + Par + Penalties */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Score">
            <input
              type="number" inputMode="numeric"
              value={score} onChange={(e) => setScore(e.target.value)}
              placeholder="e.g. 74" className={inputCls}
            />
          </Field>
          <Field label="Par">
            <input
              type="number" inputMode="numeric"
              value={par} onChange={(e) => setPar(e.target.value)}
              placeholder="72" className={inputCls}
            />
          </Field>
          <Field label="Penalties">
            <input
              type="number" inputMode="numeric" min={0}
              value={penalties} onChange={(e) => setPenalties(e.target.value)}
              placeholder="0" className={inputCls}
            />
          </Field>
        </div>

        {/* Course Rating + Slope */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Course Rating" hint="optional">
            <input
              type="number" inputMode="decimal" step="0.1"
              value={courseRating} onChange={(e) => setCourseRating(e.target.value)}
              placeholder="e.g. 71.4" className={inputCls}
            />
          </Field>
          <Field label="Slope Rating" hint="optional">
            <input
              type="number" inputMode="numeric" min={55} max={155}
              value={slopeRating} onChange={(e) => setSlopeRating(e.target.value)}
              placeholder="e.g. 128" className={inputCls}
            />
          </Field>
        </div>
        {parseInt(holes) < 18 && (
          <p className="rounded-lg border border-yellow-800/40 bg-yellow-950/20 px-3 py-2 text-xs text-yellow-500">
            For 9-hole rounds, enter the <span className="font-semibold">9-hole rating and slope</span> for your tees — not half of the 18-hole numbers. Find them on the scorecard or the USGA Course Rating Lookup.
          </p>
        )}


        {/* Live previews: rel to par + differential */}
        {(relToPar !== null || differential !== null) && (
          <div className={["grid gap-3", differential !== null ? "grid-cols-2" : "grid-cols-1"].join(" ")}>
            {relToPar !== null && (
              <div className={[
                "rounded-lg px-4 py-2.5 text-sm font-semibold text-center",
                relToPar === 0  ? "bg-[#1a1a1a] text-white"
                : relToPar < 0 ? "bg-[#052e16] text-[#22c55e]"
                               : "bg-[#1c0a09] text-[#f87171]",
              ].join(" ")}>
                {relToPar === 0 ? "Even par" : relToPar > 0 ? `+${relToPar} over par` : `${relToPar} under par`}
              </div>
            )}
            {differential !== null && (
              <div className="rounded-lg bg-[#1a1a1a] px-4 py-2.5 text-center">
                <span className="text-xs text-[#6b7280]">Differential </span>
                <span className="text-sm font-semibold text-white">{differential.toFixed(1)}</span>
              </div>
            )}
          </div>
        )}

        {/* Fairways % + GIR % */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fairways %" hint="from GHIN">
            <PctInput value={fairwaysPct} onChange={setFairwaysPct} placeholder="e.g. 64" />
          </Field>
          <Field label="GIR %" hint="from GHIN">
            <PctInput value={girPct} onChange={setGirPct} placeholder="e.g. 55" />
          </Field>
        </div>

        {/* Putts + 3-Putts + Up & Downs */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Total Putts">
            <input
              type="number" inputMode="numeric" min={0}
              value={putts} onChange={(e) => setPutts(e.target.value)}
              placeholder="e.g. 32" className={inputCls}
            />
          </Field>
          <Field label="3-Putts">
            <input
              type="number" inputMode="numeric" min={0}
              value={threePutts} onChange={(e) => setThreePutts(e.target.value)}
              placeholder="e.g. 2" className={inputCls}
            />
          </Field>
          <Field label="Up & Downs">
            <input
              type="number" inputMode="numeric" min={0}
              value={upAndDowns} onChange={(e) => setUpAndDowns(e.target.value)}
              placeholder="e.g. 4" className={inputCls}
            />
          </Field>
        </div>

        {/* Miss Left % + Miss Right % */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Missed Left %" hint="from GHIN">
            <PctInput value={missLeft} onChange={setMissLeft} placeholder="e.g. 35" />
          </Field>
          <Field label="Missed Right %" hint="from GHIN">
            <PctInput value={missRight} onChange={setMissRight} placeholder="e.g. 28" />
          </Field>
        </div>

        {/* Notes */}
        <Field label="Notes">
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="How'd it go? Anything notable…"
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
