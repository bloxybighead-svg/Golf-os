"use client"

// The sheets of a round in progress: one hole's taps, the scorecard strip, and the finish screen.

import { useState, useTransition } from "react"
import Link from "next/link"
import { calcDifferential } from "@/lib/handicap"
import { summarizeHoles, type HoleEntry, type ScoredHole } from "@/lib/rounds/holes"
import { formatToPar, localMidnight, ratingForHoles, type ActiveRound } from "@/lib/rounds/activeRound"
import { createRound } from "@/app/rounds/actions"
import { HolePad } from "@/components/rounds/HolePad"
import { holesToAskAboutOb } from "@/lib/rounds/obQuestions"
import { queueJob } from "@/lib/offline/outbox"
import { ROUND_JOB, SHOTS_JOB, shotsKey, type RoundPayload, type ShotsPayload } from "@/lib/offline/jobs"
import { addChips, finishHole, questionFor, shotsToSave, unaccountedOn, type BallNow } from "@/lib/rounds/holeTracking"
import { deleteShot, swingShotsOn } from "@/lib/rounds/shots"
import { HoleTrackingRows } from "@/components/play/HoleTrackingRows"
import { BottomSheet } from "@/components/play/BottomSheet"

/** `advance`: opened by "Hole done", so Save moves on to the next hole (fixing an earlier hole from the scorecard does not). */
export type RoundSheet = { kind: "hole"; hole: number; advance?: boolean } | { kind: "card" } | { kind: "finish"; ending?: boolean }

interface SheetProps {
  round: ActiveRound
  onRoundChange: (round: ActiveRound | null) => void
  onSheetChange: (sheet: RoundSheet | null) => void
}

const INPUT =
  "h-11 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
const PRIMARY = "flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"

const scoredHoles = (round: ActiveRound) => round.holes.filter((h): h is ScoredHole => h.strokes != null)

function RoundStats({ holes }: { holes: ScoredHole[] }) {
  const summary = summarizeHoles(holes)
  return (
    <dl className="grid grid-cols-4 gap-2 text-center">
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
}

/**
 * "Hole done": the taps for one hole. Each tap is kept as it is made, so closing the sheet loses nothing.
 * Save from "Hole done" moves the map to the next hole's tee (or finishes after the last);
 * fixing an earlier hole from the scorecard just closes.
 */
export function HoleSheet({
  round,
  holeNumber,
  advance,
  onRoundChange,
  onSheetChange,
  onGoToHole,
  ball,
  onMissedSwing,
}: SheetProps & {
  holeNumber: number
  advance: boolean
  onGoToHole: (holeNumber: number) => void
  /** Where the ball is, when this is the hole on the map; null for a hole fixed from the scorecard. */
  ball: BallNow | null
  /** "Missed a swing": closes the sheet and lets the golfer place the shot that was missed on the map. */
  onMissedSwing: () => void
}) {
  const hole = round.holes.find((h) => h.hole_number === holeNumber)
  if (!hole) return null
  const order = round.holes.map((h) => h.hole_number)
  const next = order[order.indexOf(holeNumber) + 1]
  const tracking = round.trackShots === true
  const shots = round.shots ?? []
  const swings = swingShotsOn(shots, holeNumber)
  const counts = hole.strokes != null ? { strokes: hole.strokes, putts: hole.putts, penalty: hole.penalty, penaltyShot: hole.penalty_shot ?? null } : null
  const question = tracking && counts ? questionFor(unaccountedOn(shots, holeNumber, counts), swings.length) : ({ kind: "none" } as const)

  function patch(p: Partial<HoleEntry>) {
    onRoundChange({ ...round, holes: round.holes.map((h) => (h.hole_number === holeNumber ? { ...h, ...p } : h)) })
  }

  function save() {
    if (tracking && counts) {
      const firstPutt = (hole?.putts ?? 0) >= 1 ? (hole?.first_putt_ft ?? null) : null
      const done = finishHole(shots, holeNumber, counts, firstPutt, ball)
      onRoundChange({
        ...round,
        shots: done.shots,
        holes: round.holes.map((h) => (h.hole_number === holeNumber ? { ...h, tracking: done.tracking, first_putt_ft: firstPutt } : h)),
      })
    }
    if (advance && next != null) onGoToHole(next)
    onSheetChange(advance && next == null ? { kind: "finish" } : null)
  }

  return (
    <BottomSheet
      label={`Hole ${holeNumber}`}
      title={round.course.name}
      onClose={() => onSheetChange(null)}
      footer={
        <button onClick={save} disabled={hole.strokes == null} className={PRIMARY}>
          {advance && next == null ? "Save and finish" : "Save"}
        </button>
      }
    >
      <HolePad hole={hole} onChange={patch} />
      {tracking && (
        <HoleTrackingRows
          showFirstPutt={(hole.putts ?? 0) >= 1}
          firstPuttFt={hole.first_putt_ft ?? null}
          onFirstPutt={(ft) => patch({ first_putt_ft: ft })}
          question={question.kind === "missing" && !ball ? { kind: "none" } : question}
          swings={swings}
          onChip={(count) => ball && onRoundChange({ ...round, shots: addChips(shots, holeNumber, count, ball) })}
          onMissedSwing={onMissedSwing}
          onDelete={(n) => onRoundChange({ ...round, shots: deleteShot(shots, holeNumber, n) })}
        />
      )}
    </BottomSheet>
  )
}

/** A round with scores from an earlier day: finish it, or discard it after one more question. Closing it asks again next time. */
export function OldRoundSheet({ round, onFinish, onDiscard, onClose }: { round: ActiveRound; onFinish: () => void; onDiscard: () => void; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false)
  const scored = scoredHoles(round).length
  const day = localMidnight(round.date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
  return (
    <BottomSheet
      label="Finish your round"
      title={round.course.name}
      onClose={onClose}
      footer={
        confirm ? (
          <>
            <p className="text-sm text-fg-2">Discard {scored} scored hole{scored === 1 ? "" : "s"}?</p>
            <button onClick={onDiscard} className="flex h-11 w-full items-center justify-center rounded-lg border border-danger text-sm font-semibold text-danger">
              Discard
            </button>
            <button onClick={() => setConfirm(false)} className="min-h-[44px] w-full text-sm font-semibold text-fg-2 hover:text-fg">
              Keep
            </button>
          </>
        ) : (
          <>
            <button onClick={onFinish} className={PRIMARY}>
              Finish round
            </button>
            <button onClick={() => setConfirm(true)} className="min-h-[44px] w-full text-sm font-semibold text-fg-2 hover:text-fg">
              Discard
            </button>
          </>
        )
      }
    >
      <p className="text-lg font-semibold text-fg">Finish your round from {day}?</p>
    </BottomSheet>
  )
}

/** Every hole in the round with its score; tap one to change it. */
export function ScorecardSheet({ round, onSheetChange }: Pick<SheetProps, "round" | "onSheetChange">) {
  const scored = scoredHoles(round)
  const summary = summarizeHoles(scored)
  return (
    <BottomSheet
      label="Scorecard"
      title={round.course.name}
      onClose={() => onSheetChange(null)}
      footer={
        <button onClick={() => onSheetChange({ kind: "finish" })} className={PRIMARY}>
          Finish round
        </button>
      }
    >
      <p className="text-fg-3">
        {scored.length === 0 ? "Not started" : `Thru ${scored.length} · ${summary.score} · ${formatToPar(summary.score - summary.par)}`}
      </p>
      <div className="grid grid-cols-6 gap-1.5" aria-label="Holes">
        {round.holes.map((h) => (
          <button
            key={h.hole_number}
            type="button"
            onClick={() => onSheetChange({ kind: "hole", hole: h.hole_number })}
            aria-label={`Hole ${h.hole_number}${h.strokes != null ? `, ${h.strokes}` : ""}`}
            className="flex h-12 flex-col items-center justify-center rounded-lg border border-fg/[0.08] transition-colors hover:border-fg/20"
          >
            <span className="text-[11px] text-muted">{h.hole_number}</span>
            <span className="text-sm font-semibold text-fg">{h.strokes ?? "·"}</span>
          </button>
        ))}
      </div>
      {scored.length > 0 && <RoundStats holes={scored} />}
    </BottomSheet>
  )
}

/**
 * The round's totals, rating and slope (already filled from the tee), and Save. Once saved, one question per
 * tee-shot penalty (OB left or right?), then onSaved. "End without saving" asks before it throws the round away.
 */
export function FinishSheet({
  round,
  ending,
  signedIn,
  userId,
  obAnswered,
  onObAnswer,
  onRoundChange,
  onSheetChange,
  onSaved,
}: SheetProps & {
  ending: boolean
  signedIn: boolean
  userId: string | null
  obAnswered?: (holeNumber: number) => boolean
  onObAnswer?: (holeNumber: number, side: "left" | "right") => void
  onSaved: () => void
}) {
  const scored = scoredHoles(round)
  const missing = round.holes.filter((h) => h.strokes == null).map((h) => h.hole_number)
  const summary = summarizeHoles(scored)
  // The tee's rating for the holes actually scored; editable before saving.
  const [rating, setRating] = useState(round.courseRating != null && scored.length > 0 ? String(ratingForHoles(round.courseRating, scored.length)) : "")
  const [slope, setSlope] = useState(round.slopeRating != null ? String(round.slopeRating) : "")
  const [error, setError] = useState("")
  const [confirmEnd, setConfirmEnd] = useState(ending)
  // Tee-shot penalties to ask about once the round is saved (hole numbers); null = not asking.
  const [asking, setAsking] = useState<number[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const close = () => onSheetChange(null)

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
          holes: scored,
        }
        // Saved on the phone first, then sent whenever there is signal (components/pwa/OfflineProvider).
        // Sending it again is safe: the id makes it an upsert. Only if IndexedDB is unusable is it sent directly.
        const payload: RoundPayload = { userId: userId ?? "", input }
        const queued = userId ? await queueJob({ key: round.id, kind: ROUND_JOB, payload }) : false
        if (!queued) await createRound(input)
        // The shots follow the round into the outbox, so they are only sent once the round has been. Without
        // IndexedDB (the direct send above) they are dropped: they are an extra, the round is not.
        const scoredNumbers = new Set(scored.map((h) => h.hole_number))
        const shots = shotsToSave(
          (round.shots ?? []).filter((s) => scoredNumbers.has(s.holeNumber)),
          scored.map((h) => ({ holeNumber: h.hole_number, putts: h.putts ?? null }))
        )
        if (queued && shots.length > 0) {
          const shotsPayload: ShotsPayload = { userId: userId ?? "", roundId: round.id, shots }
          await queueJob({ key: shotsKey(round.id), kind: SHOTS_JOB, payload: shotsPayload })
        }
        const questions = onObAnswer ? holesToAskAboutOb(scored, obAnswered ?? (() => false)) : []
        if (questions.length > 0) setAsking(questions)
        else onSaved()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the round.")
      }
    })
  }

  if (asking && asking.length > 0) {
    const n = asking[0]
    const next = () => (asking.length > 1 ? setAsking(asking.slice(1)) : onSaved())
    return (
      <BottomSheet label="Round saved" title="Round saved" onClose={onSaved}>
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
      </BottomSheet>
    )
  }

  const differential = scored.length > 0 ? calcDifferential(summary.score, parseFloat(rating), parseFloat(slope), scored.length) : null
  return (
    <BottomSheet
      label="Finish round"
      title={round.course.name}
      onClose={close}
      footer={
        scored.length > 0 && (
          <>
            {error && <p className="text-sm text-danger">{error}</p>}
            {signedIn ? (
              <button onClick={save} disabled={isPending} className={PRIMARY}>
                {isPending ? "Saving…" : missing.length > 0 ? `Save ${scored.length} holes` : "Save round"}
              </button>
            ) : (
              <>
                <Link href="/login?redirect=%2F" className={PRIMARY}>
                  Sign in to save
                </Link>
                <p className="text-sm text-fg-3">Your round stays on this phone until you save it.</p>
              </>
            )}
          </>
        )
      }
    >
      <div>
        <p className="label-xs">Finish round</p>
        {scored.length > 0 ? (
          <p className="mt-1 flex items-baseline gap-3">
            <span className="text-5xl font-semibold tracking-tight text-fg">{summary.score}</span>
            <span className="text-lg text-fg-2">{formatToPar(summary.score - summary.par)}</span>
            <span className="text-sm text-muted">
              {scored.length} hole{scored.length === 1 ? "" : "s"}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-fg-2">No holes scored yet.</p>
        )}
      </div>

      {scored.length > 0 && <RoundStats holes={scored} />}

      {missing.length > 0 && scored.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-fg-2">
          No score on {missing.join(", ")}.
          <button onClick={() => onSheetChange({ kind: "hole", hole: missing[0] })} className="min-h-[44px] font-semibold text-accent hover:underline">
            Score hole {missing[0]}
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
          <p className="text-sm text-fg-3">
            {round.teeName && round.courseRating != null
              ? scored.length < 18
                ? `${round.teeName} tees. Rating is the ${scored.length}-hole share of ${round.courseRating}; use the scorecard's if it differs.`
                : `${round.teeName} tees.`
              : "From the scorecard. Leave blank to save without a differential."}
            {differential != null && ` Differential ${differential.toFixed(1)}.`}
          </p>
        </>
      )}

      <div className="border-t border-fg/[0.06] pt-3">
        {confirmEnd ? (
          <p className="flex flex-wrap items-center gap-x-4 text-sm text-fg-2">
            Delete this round?
            <button
              onClick={() => {
                onRoundChange(null)
                close()
              }}
              className="min-h-[44px] font-semibold text-danger"
            >
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
    </BottomSheet>
  )
}
