"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { ChevronRight } from "lucide-react"
import type { Round } from "@/lib/supabase/types"
import { BREAKDOWN_TAGS } from "@/lib/supabase/types"
import { calcDifferential } from "@/lib/handicap"
import { createRound, getRoundHoles, updateRound } from "@/app/rounds/actions"
import { blankHoles, summarizeHoles, type HoleEntry, type ScoredHole } from "@/lib/rounds/holes"
import { Choice, HolePad } from "./HolePad"
import { CourseSearch } from "@/components/courses/CourseSearch"
import { SignInToSave } from "./SignInToSave"
import { teeFill, type Scorecard, type ScorecardTee } from "@/lib/courses/scorecard"

interface Props {
  round?: Round
  onDone: () => void
  /** Signed out: the form still works, but Save asks to sign in (the draft is kept). */
  signedIn?: boolean
}

type Mode = "holes" | "score"

// A new round in progress is kept on this device, so logging during a round
// survives the phone locking or the golfer switching apps.
const DRAFT_KEY = "golfos.roundDraft.v1"

interface Draft {
  date: string
  course: string
  courseId?: string | null
  teeName?: string | null
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

function relLabel(n: number) {
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`
}

function fullHoles(from: HoleEntry[]): HoleEntry[] {
  const out = blankHoles(18)
  for (const h of from) if (h.hole_number >= 1 && h.hole_number <= 18) out[h.hole_number - 1] = { ...h }
  return out
}

export function RoundForm({ round, onDone, signedIn = true }: Props) {
  const [isCompetitive, setIsCompetitive] = useState(round?.is_competitive ?? false)
  const [breakdownTags, setBreakdownTags] = useState<string[]>(round?.breakdown_tags ?? [])
  const [date, setDate] = useState(round?.date ?? todayISO())
  const [course, setCourse] = useState(round?.course_name ?? "")
  // Picked from course search: its OpenGolfAPI id, its tees (with ratings) and the tee chosen.
  const [courseId, setCourseId] = useState<string | null>(round?.course_id ?? null)
  const [teeName, setTeeName] = useState<string | null>(round?.tee_name ?? null)
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  const [askSignIn, setAskSignIn] = useState(false)
  const [courseRating, setCourseRating] = useState(round?.course_rating?.toString() ?? "")
  const [slopeRating, setSlopeRating] = useState(round?.slope_rating?.toString() ?? "")
  const [notes, setNotes] = useState(round?.notes ?? "")

  // Hole by hole is the default for a new round. An existing round opens the
  // way it was saved: its holes if it has any, otherwise score only.
  const [mode, setMode] = useState<Mode>(round ? "score" : "holes")
  const [holeCount, setHoleCount] = useState(round ? (round.holes_played <= 9 ? 9 : 18) : 18)
  const [holes, setHoles] = useState<HoleEntry[]>(() => blankHoles(18))
  // Hole numbers in play. A new round here is 1..9 or 1..18; a saved round
  // keeps its own (a back nine started on Play is 10-18).
  const [savedOrder, setSavedOrder] = useState<number[] | null>(null)
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
        setSavedOrder(saved.map((h) => h.hole_number))
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
        setCourseId(d.courseId ?? null)
        setTeeName(d.teeName ?? null)
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
    const d: Draft = { date, course, courseId, teeName, isCompetitive, breakdownTags, courseRating, slopeRating, notes, mode, holeCount, holes, current }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      /* storage full or private mode: the draft just isn't kept */
    }
  }, [round, draftLoaded, date, course, courseId, teeName, isCompetitive, breakdownTags, courseRating, slopeRating, notes, mode, holeCount, holes, current])

  // A course picked from search: load its scorecard (tees with ratings; each hole's par and stroke index).
  useEffect(() => {
    if (!courseId) {
      setScorecard(null)
      return
    }
    let live = true
    fetch(`/api/courses/${encodeURIComponent(courseId)}/scorecard`)
      .then((r) => (r.ok ? r.json() : null))
      .then((sc: Scorecard | null) => live && setScorecard(sc && Array.isArray(sc.tees) ? sc : null))
      .catch(() => live && setScorecard(null))
    return () => {
      live = false
    }
  }, [courseId])

  function pickCourse(c: { id: string; name: string }) {
    setCourse(c.name)
    setCourseId(c.id)
    setTeeName(null)
  }

  // Scorecard pars and stroke indexes go onto the holes as soon as they arrive (still editable on each hole).
  useEffect(() => {
    if (!scorecard || scorecard.holes.length === 0) return
    const byNumber = new Map(scorecard.holes.map((h) => [h.number, h]))
    setHoles((prev) =>
      prev.map((h) => {
        const card = byNumber.get(h.hole_number)
        return card ? { ...h, par: card.par, stroke_index: card.strokeIndex ?? h.stroke_index ?? null } : h
      })
    )
  }, [scorecard])

  const roundHoles = mode === "holes" ? (savedOrder?.length ?? holeCount) : parseInt(holesPlayed) || 18
  function pickTee(t: ScorecardTee) {
    setTeeName(t.label)
    const fill = teeFill(t, roundHoles)
    setCourseRating(String(fill.courseRating))
    setSlopeRating(String(fill.slopeRating))
    if (mode === "score") setPar(String(fill.par))
  }
  // Changing 9 / 18 holes after picking a tee refills the rating for the new length.
  useEffect(() => {
    const t = scorecard?.tees.find((x) => x.label === teeName)
    if (!t) return
    const fill = teeFill(t, roundHoles)
    setCourseRating(String(fill.courseRating))
    setSlopeRating(String(fill.slopeRating))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundHoles])

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
    setCourseId(null)
    setTeeName(null)
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

  const inPlay = savedOrder ? savedOrder.map((n) => holes[n - 1]) : holes.slice(0, holeCount)
  const count = inPlay.length
  const scored = inPlay.filter((h): h is ScoredHole => h.strokes != null)
  const summary = summarizeHoles(scored)
  const hole = inPlay[Math.min(current, count - 1)]

  function patchHole(patch: Partial<HoleEntry>) {
    setHoles((prev) => prev.map((h) => (h.hole_number === hole.hole_number ? { ...h, ...patch } : h)))
  }

  const totalScore = mode === "holes" ? (scored.length === count ? summary.score : null) : parseInt(score) || null
  const totalPar = mode === "holes" ? summary.par : parseInt(par) || null
  const relToPar = mode === "holes"
    ? scored.length > 0 ? summary.score - summary.par : null
    : totalScore != null && totalPar != null ? totalScore - totalPar : null
  const differential = totalScore != null ? calcDifferential(totalScore, parseFloat(courseRating), parseFloat(slopeRating), mode === "holes" ? count : parseInt(holesPlayed) || 18) : null

  function submit() {
    if (!date || !course.trim()) {
      setError("Date and course are required.")
      return
    }
    if (mode === "holes") {
      const missing = inPlay.filter((h) => h.strokes == null).map((h) => h.hole_number)
      const firstMissing = inPlay.findIndex((h) => h.strokes == null)
      if (missing.length > 0) {
        setError(`Score every hole. Missing: ${missing.join(", ")}.`)
        setCurrent(firstMissing)
        return
      }
    } else if (!score || !par) {
      setError("Score and par are required.")
      return
    }
    setError(null)
    if (!signedIn) {
      // Nothing is lost: the draft stays on this device and reopens after signing in.
      setAskSignIn(true)
      return
    }
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
          course_id: courseId,
          tee_name: teeName,
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
              <CourseSearch
                value={course}
                onChange={(text) => {
                  setCourse(text)
                  setCourseId(null) // typed by hand: not the searched course any more
                  setTeeName(null)
                }}
                onPick={pickCourse}
                inputClassName={inputCls}
                placeholder="e.g. Colts Neck CC"
              />
            </Field>
          </div>

          {/* Tees from the course's scorecard: fill rating, slope and par */}
          {scorecard && scorecard.tees.length > 0 && (
            <Field label="Tees" hint="fills rating and slope">
              <div className="flex flex-wrap gap-2">
                {scorecard.tees.map((t) => (
                  <Choice key={t.label} selected={teeName === t.label} onClick={() => pickTee(t)} className="px-3 text-xs font-medium">
                    {t.label} · {t.courseRating}/{t.slopeRating}
                  </Choice>
                ))}
              </div>
            </Field>
          )}

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
                  {!savedOrder && [9, 18].map((n) => (
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
                <HolePad hole={hole} onChange={patchHole} />

                {current < count - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrent((c) => c + 1)}
                    className="flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-fg/[0.08] text-sm font-semibold text-fg hover:border-fg/20"
                  >
                    Hole {inPlay[current + 1].hole_number}
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
          {(mode === "holes" ? count : parseInt(holesPlayed)) < 18 && (
            <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              For 9 holes, use the <span className="font-semibold">9-hole rating and slope</span> from your scorecard if it lists
              them{teeName ? " (half the 18-hole rating is filled in, which is close)" : ""}. Its differential uses your Handicap Index
              for the other nine, so it&rsquo;s worked out when you save.
            </p>
          )}

          {/* Rel to par + differential */}
          {(relToPar !== null || differential !== null) && (
            <p className="text-sm text-fg-2 tabular-nums">
              {relToPar !== null && (relToPar === 0 ? "Even par" : relToPar > 0 ? `${relToPar} over par` : `${-relToPar} under par`)}
              {relToPar !== null && differential !== null && " · "}
              {differential !== null && `Differential about ${differential.toFixed(1)}`}
              {differential !== null && mode === "holes" && " before score caps"}
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
      {askSignIn && <SignInToSave onSecondary={() => setAskSignIn(false)} secondaryLabel="Keep editing" />}
    </div>
  )
}
