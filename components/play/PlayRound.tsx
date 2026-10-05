"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Check, ChevronRight, X } from "lucide-react"
import type { CourseRef } from "@/lib/golfer/baseline"
import { calcDifferential } from "@/lib/handicap"
import type { Scorecard } from "@/lib/courses/scorecard"

/** Adds each hole's stroke index from the course's scorecard (for net double bogey), when the hole has none. */
async function withStrokeIndexes<T extends { hole_number: number; stroke_index?: number | null }>(courseId: string, holes: T[]): Promise<T[]> {
  try {
    // The scorecard saved at Start round answers when there is no signal.
    const card = await fetchWithSnapshot<Scorecard>(`/api/courses/${encodeURIComponent(courseId)}/scorecard`, snapshotKeys.scorecard(courseId))
    if (!card) return holes
    const si = new Map(card.holes.map((h) => [h.number, h.strokeIndex]))
    return holes.map((h) => (h.stroke_index != null ? h : { ...h, stroke_index: si.get(h.hole_number) ?? null }))
  } catch {
    return holes // offline: the round saves with approximate caps
  }
}
import { summarizeHoles, type HoleEntry, type ScoredHole } from "@/lib/rounds/holes"
import { describeOrder, holesFor, newRoundId, nextUnscored, playOrder, ratingForHoles, type ActiveRound } from "@/lib/rounds/activeRound"
import { recommendTee, type TeeOption } from "@/lib/tbox/estimate"
import { teeChoiceKey, teeOptionsFrom, type OpenGolfApiTee } from "@/lib/tbox/tees"
import { createRound } from "@/app/rounds/actions"
import { Choice, HolePad } from "@/components/rounds/HolePad"
import { holesToAskAboutOb } from "@/lib/rounds/obQuestions"
import { fetchWithSnapshot, snapshotKeys, type PrefetchReport } from "@/lib/offline/snapshots"
import { queueJob } from "@/lib/offline/outbox"
import { ROUND_JOB, type RoundPayload } from "@/lib/offline/jobs"
import { SyncStatus } from "@/components/pwa/SyncStatus"

export type PlayView = "map" | "score"

interface Props {
  course: CourseRef
  /** The course's holes as mapped: number and par (either may be missing). */
  courseHoles: { ref: number | null; par: number | null }[]
  /** The hole open on the map. */
  currentHole: number | null
  round: ActiveRound | null
  onRoundChange: (round: ActiveRound | null) => void
  view: PlayView
  onViewChange: (view: PlayView) => void
  /** Opens a hole of this course on the map. */
  onGoToHole: (holeNumber: number) => void
  /** Opens the course a round is in progress at. */
  onResume: (course: CourseRef, holeNumber: number) => void
  driverCarryYds: number | null
  handicapIndex: number | null
  signedIn: boolean
  /** The signed-in account's id: a finished round is queued under it and only ever sent to that account. */
  userId: string | null
  /** What Start round saved for offline use (null until it has run). */
  offlineReport?: PrefetchReport | null
  /** "Round saved" note after finishing: held by the parent so it survives this component moving between the dock and the page. */
  savedNote: boolean
  onSavedNote: (v: boolean) => void
  /** Whether the golfer has already said anything about OB on this hole of the open course. */
  obAnswered?: (holeNumber: number) => boolean
  /** Saves the answer to "Penalty on hole 7. Was it OB left or right?" as an OB tag for that hole. */
  onObAnswer?: (holeNumber: number, side: "left" | "right") => void
}

function relLabel(n: number) {
  return n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`
}

function localToday() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const INPUT =
  "h-11 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg tabular-nums placeholder:text-faint focus:border-accent/60 focus:outline-none"

/**
 * Keeping score on Play. No round: a "Start round" button (tees, how many
 * holes, which hole first). Round on: a Map | Score switch, and on Score the
 * taps for the hole the map is on, then a finish screen that saves the round
 * with the tee's rating and slope already filled in.
 */
export function PlayRound(props: Props) {
  const { course, round, onRoundChange, view, onViewChange, onGoToHole, onResume, signedIn, savedNote, onSavedNote: setSavedNote } = props
  const [starting, setStarting] = useState(false)

  if (!round) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setSavedNote(false)
              setStarting(true)
            }}
            className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-all hover:brightness-110"
          >
            Start round
          </button>
          {savedNote && (
            <p className="text-sm text-fg-2">
              Round saved.{" "}
              <SyncStatus className="mr-2" />
              <Link href="/rounds" className="font-semibold text-accent hover:underline">
                View rounds
              </Link>
            </p>
          )}
        </div>
        {starting && (
          <StartRoundSheet
            {...props}
            onClose={() => setStarting(false)}
            onStart={(r) => {
              onRoundChange(r)
              setStarting(false)
              onViewChange("map")
              onGoToHole(r.startHole)
            }}
          />
        )}
      </>
    )
  }

  if (round.course.id !== course.id) {
    return (
      <p className="flex flex-wrap items-center gap-x-3 text-sm text-fg-2">
        Round in progress at {round.course.name}.
        <button
          onClick={() => onResume(round.course, nextUnscored(round) ?? round.startHole)}
          className="min-h-[44px] font-semibold text-accent hover:underline"
        >
          Resume
        </button>
      </p>
    )
  }

  const scored = round.holes.filter((h): h is ScoredHole => h.strokes != null)
  const summary = summarizeHoles(scored)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" aria-label="Round" className="flex shrink-0 overflow-hidden rounded-lg border border-fg/[0.08]">
          {(["map", "score"] as PlayView[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => onViewChange(v)}
              className={`h-11 px-5 text-sm font-semibold capitalize ${
                view === v ? "bg-accent text-on-accent" : "bg-surface text-fg-3 hover:text-fg"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="min-w-0 truncate text-sm text-fg-3 tabular-nums">
          {round.teeName ? `${round.teeName} · ` : ""}
          {scored.length === 0 ? `Holes ${describeOrder(round.holes.map((h) => h.hole_number))}` : `Thru ${scored.length} · ${relLabel(summary.score - summary.par)}`}
        </p>
      </div>

      {props.offlineReport && (
        <p className={`text-xs ${props.offlineReport.failed.length > 0 ? "text-warn" : "text-fg-3"}`}>
          {props.offlineReport.failed.length > 0
            ? `Not saved for offline: ${props.offlineReport.failed.join(", ")}. Start with signal to save them.`
            : "Saved for offline: course map, tees, your shots."}
        </p>
      )}

      {view === "score" && (
        <ScorePanel
          {...props}
          round={round}
          onSaved={() => {
            onRoundChange(null)
            onViewChange("map")
            setSavedNote(true)
          }}
        />
      )}
    </div>
  )
}

// ---------- start ----------

function StartRoundSheet({
  course,
  courseHoles,
  currentHole,
  driverCarryYds,
  handicapIndex,
  onClose,
  onStart,
}: Props & { onClose: () => void; onStart: (round: ActiveRound) => void }) {
  const [tees, setTees] = useState<TeeOption[] | null>(null) // null = loading
  const [teeName, setTeeName] = useState<string | null>(null)
  // How many holes the course has, from the map data (18 when it doesn't say).
  const total = useMemo(() => {
    const refs = courseHoles.map((h) => h.ref ?? 0)
    const most = Math.max(0, ...refs)
    return most >= 1 && most <= 18 ? most : 18
  }, [courseHoles])
  const [countChoice, setCountChoice] = useState<"18" | "9" | "other">(total >= 18 ? "18" : "9")
  const [otherCount, setOtherCount] = useState("")
  const [startHole, setStartHole] = useState(1)

  useEffect(() => {
    let cancelled = false
    fetchWithSnapshot<{ tees?: OpenGolfApiTee[] }>(`/api/courses/${course.id}/tees`, snapshotKeys.tees(course.id))
      .then((d) => {
        if (cancelled) return
        const options = teeOptionsFrom((d?.tees ?? []) as OpenGolfApiTee[])
        setTees(options)
        if (options.length === 0) return
        // The tee already picked for this course, else the best fit for the bag.
        let stored: string | null = null
        try {
          stored = localStorage.getItem(teeChoiceKey(course.id))
        } catch {
          /* no stored choice */
        }
        const best =
          driverCarryYds != null ? recommendTee({ handicapIndex: handicapIndex ?? 0, driverCarryYds }, options).recommended.tee.name : options[0].name
        setTeeName(options.some((t) => t.name === stored) ? stored : best)
      })
      .catch(() => !cancelled && setTees([]))
    return () => {
      cancelled = true
    }
  }, [course.id, driverCarryYds, handicapIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const count = countChoice === "other" ? parseInt(otherCount) : parseInt(countChoice)
  const countOk = Number.isInteger(count) && count >= 1 && count <= total
  const order = countOk ? playOrder(startHole, count, total) : []
  const tee = tees?.find((t) => t.name === teeName) ?? null

  function start() {
    if (!countOk) return
    const parByHole: Record<number, number | null> = {}
    for (const h of courseHoles) if (h.ref != null) parByHole[h.ref] = h.par
    if (tee) {
      try {
        localStorage.setItem(teeChoiceKey(course.id), tee.name)
      } catch {
        /* the choice still holds for this round */
      }
    }
    onStart({
      id: newRoundId(), // the round's identity from now on (becomes rounds.id)
      course,
      date: localToday(),
      teeName: tee?.name ?? null,
      courseRating: tee?.courseRating ?? null,
      slopeRating: tee?.slopeRating ?? null,
      startHole,
      holes: holesFor(order, parByHole),
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 md:items-start md:p-4 md:pt-16" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Start round"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-fg/[0.08] bg-page pb-[env(safe-area-inset-bottom)] md:max-w-md md:rounded-2xl md:pb-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-fg/[0.08] py-2 pl-4 pr-2">
          <p className="min-w-0 truncate text-sm font-semibold text-fg">{course.name}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-fg/[0.06] hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-4 py-4">
          <section className="space-y-2">
            <p className="label-xs">Tees</p>
            {tees === null && <p className="text-sm text-muted">Loading tees…</p>}
            {tees?.length === 0 && (
              <p className="text-sm text-fg-3">No tee data for this course. Add the rating and slope when you finish.</p>
            )}
            {tees && tees.length > 0 && (
              <ul className="divide-y divide-fg/[0.06] rounded-lg border border-fg/[0.08]">
                {tees.map((t) => (
                  <li key={t.name}>
                    <button
                      onClick={() => setTeeName(t.name)}
                      aria-pressed={t.name === teeName}
                      className="flex min-h-[48px] w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-fg/[0.04]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-fg">{t.name}</span>
                        <span className="block text-xs text-muted tabular-nums">
                          {t.totalYardage.toLocaleString()} yd · {t.courseRating} / {t.slopeRating}
                        </span>
                      </span>
                      {t.name === teeName && <Check size={16} className="shrink-0 text-accent" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <p className="label-xs">Holes</p>
            <div className="flex flex-wrap items-center gap-2">
              {total >= 18 && (
                <Choice selected={countChoice === "18"} onClick={() => setCountChoice("18")} className="px-4">
                  18
                </Choice>
              )}
              {total >= 9 && (
                <Choice selected={countChoice === "9"} onClick={() => setCountChoice("9")} className="px-4">
                  9
                </Choice>
              )}
              <Choice selected={countChoice === "other"} onClick={() => setCountChoice("other")} className="px-4">
                Other
              </Choice>
              {countChoice === "other" && (
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={total}
                  value={otherCount}
                  onChange={(e) => setOtherCount(e.target.value)}
                  placeholder={`1–${total}`}
                  aria-label="Number of holes"
                  autoFocus
                  className={`${INPUT} w-24`}
                />
              )}
            </div>
          </section>

          <section className="space-y-2">
            <p className="label-xs">Starting hole</p>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                <Choice key={n} selected={startHole === n} onClick={() => setStartHole(n)} label={`Start on hole ${n}`}>
                  {n}
                </Choice>
              ))}
            </div>
            {currentHole != null && currentHole !== startHole && currentHole <= total && (
              <button onClick={() => setStartHole(currentHole)} className="min-h-[44px] text-sm font-semibold text-accent hover:underline">
                Start on hole {currentHole}
              </button>
            )}
          </section>
        </div>

        <div className="shrink-0 space-y-2 border-t border-fg/[0.08] px-4 py-3">
          <p className="text-sm text-fg-3 tabular-nums">
            {countOk
              ? [
                  `${count} hole${count === 1 ? "" : "s"}: ${describeOrder(order)}`,
                  ...(tee ? [`${tee.name} ${ratingForHoles(tee.courseRating, count)} / ${tee.slopeRating}`] : []),
                ].join(" · ")
              : `Enter 1 to ${total} holes.`}
          </p>
          <button
            onClick={start}
            disabled={!countOk || tees === null}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
          >
            Start round
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ---------- score ----------

function ScorePanel({
  round,
  currentHole,
  onRoundChange,
  onGoToHole,
  onViewChange,
  signedIn,
  userId,
  obAnswered,
  onObAnswer,
  onSaved,
}: Props & { round: ActiveRound; onSaved: () => void }) {
  // Tee-shot penalties to ask about once the round is saved (hole numbers); null = not asking.
  const [asking, setAsking] = useState<number[] | null>(null)
  const order = round.holes.map((h) => h.hole_number)
  // The hole being scored follows the map while the map is on a hole of this
  // round; its own state covers courses whose map data is missing a hole.
  const [holeNumber, setHoleNumber] = useState(() => (currentHole != null && order.includes(currentHole) ? currentHole : nextUnscored(round) ?? order[0]))
  const [finishing, setFinishing] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [rating, setRating] = useState("")
  const [slope, setSlope] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (currentHole != null && round.holes.some((h) => h.hole_number === currentHole)) setHoleNumber(currentHole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHole])

  const index = Math.max(0, order.indexOf(holeNumber))
  const hole = round.holes[index]
  const scored = round.holes.filter((h): h is ScoredHole => h.strokes != null)
  const missing = round.holes.filter((h) => h.strokes == null).map((h) => h.hole_number)
  const summary = summarizeHoles(scored)

  function goTo(n: number) {
    setHoleNumber(n)
    onGoToHole(n)
  }

  function patchHole(patch: Partial<HoleEntry>) {
    onRoundChange({ ...round, holes: round.holes.map((h) => (h.hole_number === hole.hole_number ? { ...h, ...patch } : h)) })
  }

  function openFinish() {
    // The tee's rating for the holes actually scored; editable before saving.
    setRating(round.courseRating != null && scored.length > 0 ? String(ratingForHoles(round.courseRating, scored.length)) : "")
    setSlope(round.slopeRating != null ? String(round.slopeRating) : "")
    setError("")
    setFinishing(true)
  }

  function save() {
    setError("")
    startTransition(async () => {
      try {
        const input = {
          id: round.id,
          date: round.date,
          course_name: round.course.name,
          is_competitive: false,
          breakdown_tags: [],
          course_rating: rating !== "" ? parseFloat(rating) : null,
          slope_rating: slope !== "" ? parseInt(slope) : null,
          notes: round.teeName ? `${round.teeName} tees` : null,
          course_id: round.course.id,
          tee_name: round.teeName,
          holes: await withStrokeIndexes(round.course.id, scored),
        }
        // Saved on the phone first, then sent whenever there is signal (components/pwa/OfflineProvider).
        // Sending it again is safe: the id makes it an upsert. Only if IndexedDB is unusable is it sent directly.
        const payload: RoundPayload = { userId: userId ?? "", input }
        const queued = userId ? await queueJob({ key: round.id, kind: ROUND_JOB, payload }) : false
        if (!queued) await createRound(input)
        const questions = onObAnswer ? holesToAskAboutOb(scored, obAnswered ?? (() => false)) : []
        if (questions.length > 0) setAsking(questions)
        else onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the round.")
      }
    })
  }

  const stats = (
    <dl className="grid grid-cols-4 gap-2 text-center tabular-nums">
      {(
        [
          ["Fairways", summary.fairways_pct != null ? `${Math.round(summary.fairways_pct)}%` : null],
          ["Greens", summary.gir_pct != null ? `${Math.round(summary.gir_pct)}%` : null],
          ["Putts", summary.total_putts],
          ["Up & down", summary.up_and_down_chances > 0 ? `${summary.up_and_downs}/${summary.up_and_down_chances}` : null],
        ] as const
      ).map(([label, v]) => (
        <div key={label}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="text-sm font-semibold text-fg">{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  )

  // One question per tee-shot penalty, asked once the round is saved.
  if (asking && asking.length > 0) {
    const n = asking[0]
    const next = () => (asking.length > 1 ? setAsking(asking.slice(1)) : onSaved())
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <p className="label-xs">Round saved</p>
        <p className="text-lg font-semibold text-fg">Penalty on hole {n}. Was it OB left or right?</p>
        <div className="flex flex-wrap gap-2">
          {(["left", "right"] as const).map((side) => (
            <button
              key={side}
              onClick={() => {
                onObAnswer?.(n, side)
                next()
              }}
              className="h-11 min-w-24 rounded-lg border border-fg/[0.12] px-4 text-sm font-semibold capitalize text-fg hover:bg-fg/[0.04]"
            >
              {side}
            </button>
          ))}
          <button onClick={next} className="h-11 rounded-lg px-4 text-sm text-fg-3 hover:text-fg">
            Not OB
          </button>
        </div>
      </div>
    )
  }

  if (finishing) {
    const differential = scored.length > 0 ? calcDifferential(summary.score, parseFloat(rating), parseFloat(slope), scored.length) : null
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div>
          <p className="label-xs">Finish round</p>
          {scored.length > 0 ? (
            <p className="mt-1 flex items-baseline gap-3 tabular-nums">
              <span className="text-5xl font-semibold tracking-tight text-fg">{summary.score}</span>
              <span className="text-lg text-fg-2">{relLabel(summary.score - summary.par)}</span>
              <span className="text-sm text-muted">
                {scored.length} hole{scored.length === 1 ? "" : "s"}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-fg-2">No holes scored yet.</p>
          )}
        </div>

        {scored.length > 0 && stats}

        {missing.length > 0 && scored.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-fg-2">
            No score on {missing.join(", ")}.
            <button
              onClick={() => {
                setFinishing(false)
                goTo(missing[0])
              }}
              className="min-h-[44px] font-semibold text-accent hover:underline"
            >
              Go to hole {missing[0]}
            </button>
          </p>
        )}

        {scored.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Course rating</span>
                <input type="number" inputMode="decimal" step="0.1" value={rating} onChange={(e) => setRating(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Slope</span>
                <input type="number" inputMode="numeric" value={slope} onChange={(e) => setSlope(e.target.value)} className={INPUT} />
              </label>
            </div>
            <p className="text-sm text-fg-3 tabular-nums">
              {round.teeName && round.courseRating != null
                ? scored.length < 18
                  ? `${round.teeName} tees. Rating is the ${scored.length}-hole share of ${round.courseRating}; use the scorecard's if it differs.`
                  : `${round.teeName} tees.`
                : "From the scorecard. Leave blank to save without a differential."}
              {differential != null && ` Differential ${differential.toFixed(1)}.`}
            </p>
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {scored.length > 0 &&
            (signedIn ? (
              <button
                onClick={save}
                disabled={isPending}
                className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
              >
                {isPending ? "Saving…" : missing.length > 0 ? `Save ${scored.length} holes` : "Save round"}
              </button>
            ) : (
              <Link
                href="/login?redirect=%2F"
                className="flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-all hover:brightness-110"
              >
                Sign in to save
              </Link>
            ))}
          <button
            onClick={() => setFinishing(false)}
            className="h-11 rounded-lg border border-fg/[0.08] px-5 text-sm font-semibold text-fg-2 hover:text-fg"
          >
            Back
          </button>
        </div>
        {!signedIn && scored.length > 0 && <p className="text-sm text-fg-3">Your round stays on this phone until you save it.</p>}

        <div className="border-t border-fg/[0.06] pt-3">
          {confirmEnd ? (
            <p className="flex flex-wrap items-center gap-x-4 text-sm text-fg-2">
              Delete this round?
              <button onClick={() => { onRoundChange(null); onViewChange("map") }} className="min-h-[44px] font-semibold text-danger">
                Delete
              </button>
              <button onClick={() => setConfirmEnd(false)} className="min-h-[44px] font-semibold text-fg-2 hover:text-fg">
                Keep
              </button>
            </p>
          ) : (
            <button onClick={() => setConfirmEnd(true)} className="min-h-[44px] text-sm text-muted hover:text-danger">
              End without saving
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Every hole in the round, its score once entered */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Holes">
        {round.holes.map((h) => (
          <button
            key={h.hole_number}
            type="button"
            onClick={() => goTo(h.hole_number)}
            aria-label={`Hole ${h.hole_number}${h.strokes != null ? `, ${h.strokes}` : ""}`}
            aria-current={h.hole_number === hole.hole_number}
            className={[
              "flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-lg border tabular-nums transition-colors",
              h.hole_number === hole.hole_number ? "border-accent" : "border-fg/[0.08]",
            ].join(" ")}
          >
            <span className="text-[11px] text-muted">{h.hole_number}</span>
            <span className="text-sm font-semibold text-fg">{h.strokes ?? "·"}</span>
          </button>
        ))}
      </div>

      <HolePad hole={hole} onChange={patchHole} />

      {index < order.length - 1 ? (
        <button
          type="button"
          onClick={() => goTo(order[index + 1])}
          className="flex h-11 w-full items-center justify-center gap-1 rounded-lg border border-fg/[0.08] text-sm font-semibold text-fg hover:border-fg/20"
        >
          Hole {order[index + 1]}
          <ChevronRight size={16} />
        </button>
      ) : (
        <button
          type="button"
          onClick={openFinish}
          className="flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent hover:brightness-110"
        >
          Finish round
        </button>
      )}

      {scored.length > 0 && <div className="border-t border-fg/[0.06] pt-4">{stats}</div>}

      {index < order.length - 1 && (
        <button onClick={openFinish} className="min-h-[44px] text-sm font-semibold text-accent hover:underline">
          Finish round
        </button>
      )}
    </div>
  )
}
