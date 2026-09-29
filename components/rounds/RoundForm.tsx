"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ChevronRight } from "lucide-react"
import type { Round } from "@/lib/supabase/types"
import { BREAKDOWN_TAGS } from "@/lib/supabase/types"
import { calcDifferential } from "@/lib/handicap"
import { createRound, getRoundHoles, updateRound } from "@/app/rounds/actions"
import { blankHoles, summarizeHoles, type GreenMiss, type HoleEntry, type ScoredHole } from "@/lib/rounds/holes"

interface Props {
  round?: Round
  onDone: () => void
}

type Mode = "holes" | "score"

// A new round in progress is kept on this device, so logging during a round
// survives the phone locking or the golfer switching apps.
const DRAFT_KEY = "golfos.roundDraft.v1"

interface Draft {
  date: string
  course: string
  isCompetitive: boolean
  breakdownTags: string[]
  courseRating: string
  slopeRating: string
  notes: string
  mode: Mode
  holeCount: number
  holes: HoleEntry[]
  current: number
}

function todayISO() {
  return new Date().toISOString().split("T")[0]
}

const inputCls =
  "w-full rounded-lg border border-fg/[0.08] bg-surface-3 px-3 py-2.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none transition-colors"

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 flex items-baseline gap-2 text-xs font-medium uppercase tracking-widest text-muted">
        {label}
        {hint && <span className="normal-case tracking-normal text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

/** One tap target: 44px, filled with the accent when chosen. */
function Choice({
  selected,
  onClick,
  children,
  label,
  className = "",
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  label?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      className={[
        "flex h-11 min-w-[44px] items-center justify-center rounded-lg border px-2 text-sm font-semibold tabular-nums transition-colors",
        selected ? "border-accent bg-accent text-on-accent" : "border-fg/[0.08] bg-surface text-fg-2 hover:border-fg/20 hover:text-fg",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="label-xs">{label}</p>
      {children}
    </div>
  )
}

function relLabel(n: number) {
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`
}

function fullHoles(from: HoleEntry[]): HoleEntry[] {
  const out = blankHoles(18)
  for (const h of from) if (h.hole_number >= 1 && h.hole_number <= 18) out[h.hole_number - 1] = { ...h }
  return out
}

export function RoundForm({ round, onDone }: Props) {
  const [isCompetitive, setIsCompetitive] = useState(round?.is_competitive ?? false)
  const [breakdownTags, setBreakdownTags] = useState<string[]>(round?.breakdown_tags ?? [])
  const [date, setDate] = useState(round?.date ?? todayISO())
  const [course, setCourse] = useState(round?.course_name ?? "")
  const [courseRating, setCourseRating] = useState(round?.course_rating?.toString() ?? "")
  const [slopeRating, setSlopeRating] = useState(round?.slope_rating?.toString() ?? "")
  const [notes, setNotes] = useState(round?.notes ?? "")

  // Hole by hole is the default for a new round. An existing round opens the
  // way it was saved: its holes if it has any, otherwise score only.
  const [mode, setMode] = useState<Mode>(round ? "score" : "holes")
  const [holeCount, setHoleCount] = useState(round ? (round.holes_played <= 9 ? 9 : 18) : 18)
  const [holes, setHoles] = useState<HoleEntry[]>(() => blankHoles(18))
  const [current, setCurrent] = useState(0)
  const [loadingHoles, setLoadingHoles] = useState(!!round)
  const [hadHoles, setHadHoles] = useState(false)

  // Score only.
  const [holesPlayed, setHolesPlayed] = useState(round?.holes_played?.toString() ?? "18")
  const [score, setScore] = useState(round?.score?.toString() ?? "")
  const [par, setPar] = useState(round?.par?.toString() ?? "72")

  const [error, setError] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)
  const [isPending, startTransition] = useTransition()
  // Set once any draft has been read, so the first save can't overwrite it
  // with a blank form (state, not a ref: it takes effect a render later).
  const [draftLoaded, setDraftLoaded] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)

  // Editing: load the round's holes.
  useEffect(() => {
    if (!round) return
    let live = true
    getRoundHoles(round.id)
      .then((saved) => {
        if (!live || saved.length === 0) return
        setHoles(fullHoles(saved))
        setHoleCount(saved.length <= 9 ? 9 : 18)
        setMode("holes")
        setHadHoles(true)
      })
      .catch(() => {
        /* no holes to show: stays score only */
      })
      .finally(() => live && setLoadingHoles(false))
    return () => {
      live = false
    }
  }, [round])

  // New round: pick up a draft left on this device.
  useEffect(() => {
    if (round) return
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null
      if (d && Array.isArray(d.holes) && d.holes.length === 18) {
        setDate(d.date)
        setCourse(d.course)
        setIsCompetitive(d.isCompetitive)
        setBreakdownTags(d.breakdownTags)
        setCourseRating(d.courseRating)
        setSlopeRating(d.slopeRating)
        setNotes(d.notes)
        setMode(d.mode)
        setHoleCount(d.holeCount)
        setHoles(d.holes)
        setCurrent(Math.min(d.current, d.holeCount - 1))
        setRestored(d.holes.some((h) => h.strokes != null) || !!d.course)
      }
    } catch {
      /* no usable draft */
    }
    setDraftLoaded(true)
  }, [round])

  useEffect(() => {
    if (round || !draftLoaded) return
    const d: Draft = { date, course, isCompetitive, breakdownTags, courseRating, slopeRating, notes, mode, holeCount, holes, current }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      /* storage full or private mode: the draft just isn't kept */
    }
  }, [round, draftLoaded, date, course, isCompetitive, breakdownTags, courseRating, slopeRating, notes, mode, holeCount, holes, current])

  // Keep the current hole's chip in view in the strip.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-hole="${current}"]`)
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
  }, [current])

  function startOver() {
    try {
      localStorage.removeItem(DRAFT_KEY)
    } catch {
      /* nothing stored */
    }
    setDate(todayISO())
    setCourse("")
    setIsCompetitive(false)
    setBreakdownTags([])
    setCourseRating("")
    setSlopeRating("")
    setNotes("")
    setHoles(blankHoles(18))
    setCurrent(0)
    setRestored(false)
  }

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

  function patchHole(patch: Partial<HoleEntry>) {
    setHoles((prev) => prev.map((h, i) => (i === current ? { ...h, ...patch } : h)))
  }

  const inPlay = holes.slice(0, holeCount)
  const scored = inPlay.filter((h): h is ScoredHole => h.strokes != null)
  const summary = summarizeHoles(scored)
  const hole = holes[current]

  const totalScore = mode === "holes" ? (scored.length === holeCount ? summary.score : null) : parseInt(score) || null
  const totalPar = mode === "holes" ? summary.par : parseInt(par) || null
  const relToPar = mode === "holes"
    ? scored.length > 0 ? summary.score - summary.par : null
    : totalScore != null && totalPar != null ? totalScore - totalPar : null
  const differential = totalScore != null ? calcDifferential(totalScore, parseFloat(courseRating), parseFloat(slopeRating)) : null

  function submit() {
    if (!date || !course.trim()) {
      setError("Date and course are required.")
      return
    }
    if (mode === "holes") {
      const missing = inPlay.filter((h) => h.strokes == null).map((h) => h.hole_number)
      if (missing.length > 0) {
        setError(`Score every hole. Missing: ${missing.join(", ")}.`)
        setCurrent(missing[0] - 1)
        return
      }
    } else if (!score || !par) {
      setError("Score and par are required.")
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const payload = {
          date,
          course_name: course.trim(),
          is_competitive: isCompetitive,
          breakdown_tags: isCompetitive ? breakdownTags : [],
          course_rating: courseRating !== "" ? parseFloat(courseRating) : null,
          slope_rating: slopeRating !== "" ? parseInt(slopeRating) : null,
          notes: notes.trim() || null,
          ...(mode === "holes"
            ? { holes: inPlay }
            : { holes: null, score: parseInt(score), par: parseInt(par), holes_played: parseInt(holesPlayed) || 18 }),
        }
        if (round) await updateRound(round.id, payload)
        else await createRound(payload)
        if (!round) {
          try {
            localStorage.removeItem(DRAFT_KEY)
          } catch {
            /* nothing stored */
          }
        }
        onDone()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
    })
  }

  // Score buttons around par: par-2 .. par+3, then one more that counts up.
  const scoreChoices = hole ? Array.from({ length: 6 }, (_, i) => hole.par - 2 + i).filter((n) => n >= 1) : []
  const bigNumber = hole ? hole.par + 4 : 0
  const green = (side: GreenMiss) => (
    <Choice
      selected={hole.green_hit === false && hole.green_miss_side === side}
      onClick={() =>
        hole.green_hit === false && hole.green_miss_side === side
          ? patchHole({ green_hit: null, green_miss_side: null })
          : patchHole({ green_hit: false, green_miss_side: side })
      }
      label={`Green missed ${side}`}
      className="w-full"
    >
      {side[0].toUpperCase() + side.slice(1)}
    </Choice>
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-fg/[0.06] px-5 py-3.5">
        <button onClick={onDone} className="min-h-[44px] text-sm text-muted transition-colors hover:text-fg">
          Cancel
        </button>
        <span className="text-sm font-semibold text-fg">{round ? "Edit round" : "Add round"}</span>
        <button
          onClick={submit}
          disabled={!course.trim() || isPending || loadingHoles}
          className="min-h-[44px] text-sm font-semibold text-accent transition-opacity hover:opacity-80 disabled:opacity-30"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg space-y-5 px-5 py-6">
          {restored && (
            <p className="flex items-center justify-between gap-3 text-sm text-fg-3">
              Picked up where you left off.
              <button onClick={startOver} className="min-h-[44px] font-semibold text-accent hover:underline">
                Start over
              </button>
            </p>
          )}

          {/* Date + Course */}
          <div className="grid grid-cols-[auto_1fr] gap-3">
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

          {/* How to log it */}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to log">
            <Choice selected={mode === "holes"} onClick={() => setMode("holes")}>Hole by hole</Choice>
            <Choice selected={mode === "score"} onClick={() => setMode("score")}>Score only</Choice>
          </div>

          {mode === "holes" && loadingHoles && <p className="text-sm text-muted">Loading holes…</p>}

          {mode === "holes" && !loadingHoles && hole && (
            <section className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  {[9, 18].map((n) => (
                    <Choice
                      key={n}
                      selected={holeCount === n}
                      onClick={() => {
                        setHoleCount(n)
                        setCurrent((c) => Math.min(c, n - 1))
                      }}
                    >
                      {n} holes
                    </Choice>
                  ))}
                </div>
                <p className="text-sm text-fg-3 tabular-nums">
                  {scored.length === 0
                    ? "Not started"
                    : `Thru ${scored.length} · ${summary.score} · ${relLabel(summary.score - summary.par)}`}
                </p>
              </div>

              {/* Hole strip: every hole, its score once entered */}
              <div ref={stripRef} className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" aria-label="Holes">
                {inPlay.map((h, i) => (
                  <button
                    key={h.hole_number}
                    data-hole={i}
                    type="button"
                    onClick={() => setCurrent(i)}
                    aria-label={`Hole ${h.hole_number}${h.strokes != null ? `, ${h.strokes}` : ""}`}
                    aria-current={i === current}
                    className={[
                      "flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-lg border tabular-nums transition-colors",
                      i === current ? "border-accent" : "border-fg/[0.08]",
                    ].join(" ")}
                  >
                    <span className="text-[11px] text-muted">{h.hole_number}</span>
                    <span className="text-sm font-semibold text-fg">{h.strokes ?? "·"}</span>
                  </button>
                ))}
              </div>

              {/* The current hole */}
              <div className="space-y-5 border-t border-fg/[0.06] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-fg">Hole {hole.hole_number}</h3>
                  <div className="flex items-center gap-1" role="radiogroup" aria-label="Par">
                    <span className="mr-1 text-xs text-muted">Par</span>
                    {[3, 4, 5].map((p) => (
                      <Choice
                        key={p}
                        selected={hole.par === p}
                        onClick={() =>
                          patchHole(p === 3 ? { par: p, fairway_hit: null, fairway_miss_side: null } : { par: p })
                        }
                        label={`Par ${p}`}
                      >
                        {p}
                      </Choice>
                    ))}
                  </div>
                </div>

                <Row label="Score">
                  <div className="grid grid-cols-7 gap-1">
                    {scoreChoices.map((n) => (
                      <Choice key={n} selected={hole.strokes === n} onClick={() => patchHole({ strokes: n })}>
                        {n}
                      </Choice>
                    ))}
                    <Choice
                      selected={hole.strokes != null && hole.strokes >= bigNumber}
                      onClick={() =>
                        patchHole({ strokes: hole.strokes != null && hole.strokes >= bigNumber ? Math.min(hole.strokes + 1, 20) : bigNumber })
                      }
                      label={hole.strokes != null && hole.strokes >= bigNumber ? `${hole.strokes}, tap for one more` : `${bigNumber} or more`}
                    >
                      {hole.strokes != null && hole.strokes >= bigNumber ? hole.strokes : `${bigNumber}+`}
                    </Choice>
                  </div>
                </Row>

                {hole.par > 3 && (
                  <Row label="Tee shot">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["left", "hit", "right"] as const).map((t) => {
                        const selected = t === "hit" ? hole.fairway_hit === true : hole.fairway_hit === false && hole.fairway_miss_side === t
                        return (
                          <Choice
                            key={t}
                            selected={selected}
                            onClick={() =>
                              selected
                                ? patchHole({ fairway_hit: null, fairway_miss_side: null })
                                : t === "hit"
                                  ? patchHole({ fairway_hit: true, fairway_miss_side: null })
                                  : patchHole({ fairway_hit: false, fairway_miss_side: t })
                            }
                            label={t === "hit" ? "Fairway hit" : `Fairway missed ${t}`}
                          >
                            {t === "hit" ? "Fairway" : t === "left" ? "Left" : "Right"}
                          </Choice>
                        )
                      })}
                    </div>
                  </Row>
                )}

                <Row label="Approach">
                  {/* Laid out like the green: long above, short below */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <div />
                    {green("long")}
                    <div />
                    {green("left")}
                    <Choice
                      selected={hole.green_hit === true}
                      onClick={() =>
                        hole.green_hit === true
                          ? patchHole({ green_hit: null, green_miss_side: null })
                          : patchHole({ green_hit: true, green_miss_side: null })
                      }
                      label="Green in regulation"
                      className="w-full"
                    >
                      Green
                    </Choice>
                    {green("right")}
                    <div />
                    {green("short")}
                    <div />
                  </div>
                </Row>

                <Row label="Putts">
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0, 1, 2, 3, 4].map((n) => {
                      const selected = n === 4 ? (hole.putts ?? 0) >= 4 : hole.putts === n
                      return (
                        <Choice
                          key={n}
                          selected={selected}
                          onClick={() =>
                            patchHole({ putts: n === 4 && selected ? Math.min((hole.putts ?? 4) + 1, 10) : selected ? null : n })
                          }
                          label={n === 4 ? "4 or more putts" : `${n} putts`}
                        >
                          {n === 4 && (hole.putts ?? 0) > 4 ? hole.putts : n === 4 ? "4+" : n}
                        </Choice>
                      )
                    })}
                  </div>
                </Row>

                <Choice selected={hole.penalty} onClick={() => patchHole({ penalty: !hole.penalty })} className="px-4">
                  Penalty
                </Choice>

                {current < holeCount - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrent((c) => c + 1)}
                    className="flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-fg/[0.08] text-sm font-semibold text-fg hover:border-fg/20"
                  >
                    Hole {hole.hole_number + 1}
                    <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!course.trim() || isPending}
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50"
                  >
                    {isPending ? "Saving…" : "Save round"}
                  </button>
                )}
              </div>

              {/* What the taps add up to: the numbers saved with the round */}
              {scored.length > 0 && (
                <dl className="grid grid-cols-4 gap-2 border-t border-fg/[0.06] pt-4 text-center tabular-nums">
                  {[
                    ["Fairways", summary.fairways_pct],
                    ["Greens", summary.gir_pct],
                    ["Putts", summary.total_putts],
                    ["Up & down", summary.up_and_down_chances > 0 ? `${summary.up_and_downs}/${summary.up_and_down_chances}` : null],
                  ].map(([label, v]) => (
                    <div key={label as string}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="text-sm font-semibold text-fg">
                        {v == null ? "–" : typeof v === "number" && label !== "Putts" ? `${Math.round(v)}%` : v}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}

          {mode === "score" && hadHoles && (
            <p className="text-sm text-fg-3">Saving as score only drops this round&apos;s hole stats.</p>
          )}

          {mode === "score" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Score">
                <input
                  type="number" inputMode="numeric"
                  value={score} onChange={(e) => setScore(e.target.value)}
                  placeholder="e.g. 84" className={inputCls}
                />
              </Field>
              <Field label="Par">
                <input
                  type="number" inputMode="numeric"
                  value={par} onChange={(e) => setPar(e.target.value)}
                  placeholder="72" className={inputCls}
                />
              </Field>
              <Field label="Holes">
                <input
                  type="number" inputMode="numeric" min={1} max={18}
                  value={holesPlayed} onChange={(e) => setHolesPlayed(e.target.value)}
                  placeholder="18" className={inputCls}
                />
              </Field>
            </div>
          )}

          {/* Course Rating + Slope */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Course rating" hint="scorecard">
              <input
                type="number" inputMode="decimal" step="0.1"
                value={courseRating} onChange={(e) => setCourseRating(e.target.value)}
                placeholder="e.g. 71.4" className={inputCls}
              />
            </Field>
            <Field label="Slope" hint="scorecard">
              <input
                type="number" inputMode="numeric" min={55} max={155}
                value={slopeRating} onChange={(e) => setSlopeRating(e.target.value)}
                placeholder="e.g. 128" className={inputCls}
              />
            </Field>
          </div>
          {(mode === "holes" ? holeCount : parseInt(holesPlayed)) < 18 && (
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              For 9 holes, enter the <span className="font-semibold">9-hole rating and slope</span> for your tees, not half of the 18-hole numbers.
            </p>
          )}

          {/* Rel to par + differential */}
          {(relToPar !== null || differential !== null) && (
            <p className="text-sm text-fg-2 tabular-nums">
              {relToPar !== null && (relToPar === 0 ? "Even par" : relToPar > 0 ? `${relToPar} over par` : `${-relToPar} under par`)}
              {relToPar !== null && differential !== null && " · "}
              {differential !== null && `Differential ${differential.toFixed(1)}`}
            </p>
          )}

          {/* Competitive toggle */}
          <button
            type="button"
            onClick={() => setIsCompetitive((v) => !v)}
            aria-pressed={isCompetitive}
            className={[
              "flex min-h-[44px] w-full items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
              isCompetitive
                ? "border-accent/40 bg-accent/10 text-fg"
                : "border-fg/[0.08] bg-surface-3 text-muted hover:border-fg/20 hover:text-fg",
            ].join(" ")}
          >
            <span
              className={[
                "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                isCompetitive ? "border-accent bg-accent" : "border-fg/20 bg-transparent",
              ].join(" ")}
            >
              {isCompetitive && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="text-on-accent">
                  <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="font-medium">Competitive round</span>
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
                        "min-h-[36px] rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "border-warn/50 bg-warn/15 text-warn"
                          : "border-fg/[0.08] bg-surface-3 text-muted hover:border-fg/20 hover:text-fg",
                      ].join(" ")}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="How'd it go?"
              rows={3}
              className="w-full resize-none rounded-lg border border-fg/[0.08] bg-surface-3 px-3 py-2.5 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none transition-colors"
            />
          </Field>

          {error && (
            <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <div className="h-8" />
        </div>
      </div>
    </div>
  )
}
