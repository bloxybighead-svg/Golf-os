"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import type { CourseRef } from "@/lib/golfer/baseline"
import type { Scorecard } from "@/lib/courses/scorecard"
import { summarizeHoles, type ScoredHole } from "@/lib/rounds/holes"
import { describeOrder, formatToPar, holeToScore, holesFor, localDate, newRoundId, nextUnscored, playOrder, ratingForHoles, type ActiveRound } from "@/lib/rounds/activeRound"
import { recommendTee, type TeeOption } from "@/lib/tbox/estimate"
import { driveYdsFor, teeOptionsFrom, type OpenGolfApiTee } from "@/lib/tbox/tees"
import { loadTeeChoice, saveTeeChoice } from "@/lib/planner/storage"
import { Choice } from "@/components/rounds/HolePad"
import { fetchWithSnapshot, snapshotKeys, type PrefetchReport } from "@/lib/offline/snapshots"
import { SyncStatus } from "@/components/pwa/SyncStatus"
import { Toast } from "@/components/play/Toast"
import { BottomSheet } from "@/components/play/BottomSheet"
import type { BallNow } from "@/lib/rounds/holeTracking"
import { TrackShotsToggle } from "@/components/play/TrackShotsToggle"
import { FinishSheet, HoleSheet, ScorecardSheet, type RoundSheet } from "@/components/play/RoundSheets"

interface Props {
  course: CourseRef
  /** The course's holes as mapped: number and par (either may be missing). */
  courseHoles: { ref: number | null; par: number | null }[]
  /** The hole open on the map. */
  currentHole: number | null
  round: ActiveRound | null
  onRoundChange: (round: ActiveRound | null) => void
  /** Which round sheet is open (hole taps, scorecard, finish), if any. */
  sheet: RoundSheet | null
  onSheetChange: (sheet: RoundSheet | null) => void
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
  /** "Round saved" toast after finishing: held by the parent so it survives this component moving between the dock and the page. */
  savedNote: boolean
  onSavedNote: (v: boolean) => void
  /** Whether the golfer has already said anything about OB on this hole of the open course. */
  obAnswered?: (holeNumber: number) => boolean
  /** Saves the answer to "Penalty on hole 7. Was it OB left or right?" as an OB tag for that hole. */
  onObAnswer?: (holeNumber: number, side: "left" | "right") => void
  /** The hole the golfer seems to be standing at, offered as a tap (never switched to by itself). */
  holeOffer: number | null
  onHoleOffer: (accepted: boolean) => void
  /** Where the ball is on the hole the map shows (for Hole done's shot check); null without a plan. */
  ball: BallNow | null
  /** Hole done's "Missed a swing": place the missed shot on the map. */
  onMissedSwing: () => void
  /** Track every shot: the Shot button beside Hole done (the round screen has its own in the dock). Null when tracking is off. */
  shot: { club: string | null; onTap: () => void; disabled: boolean } | null
  /** On the round screen, which has its own header and dock: only the toasts and sheets render. */
  embedded?: boolean
}

/** How long the "Saved for offline" toast stays; a failure stays longer because the golfer has to act on it. */
const OFFLINE_TOAST_MS = 2000
const OFFLINE_FAILED_TOAST_MS = 6000
const SAVED_TOAST_MS = 6000
const HOLE_OFFER_TOAST_MS = 10000

const INPUT =
  "h-11 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"

/**
 * Keeping score on Play. No round: a "Start round" button (tees, how many
 * holes, which hole first). Round on: a "Hole done" button that opens the
 * taps for the hole, a scorecard to fix any hole, and a finish sheet that
 * saves the round with the tee's rating and slope already filled in.
 */
export function PlayRound(props: Props) {
  const { course, round, onRoundChange, sheet, onSheetChange, onGoToHole, onResume, signedIn, savedNote, onSavedNote: setSavedNote, onHoleOffer } = props
  const [starting, setStarting] = useState(false)
  const [offlineToast, setOfflineToast] = useState(false)
  const clearOfflineToast = useCallback(() => setOfflineToast(false), [])
  useEffect(() => setOfflineToast(props.offlineReport != null), [props.offlineReport])
  const clearSavedNote = useCallback(() => setSavedNote(false), [setSavedNote])
  const declineOffer = useCallback(() => onHoleOffer(false), [onHoleOffer])

  if (!round) {
    return (
      <>
        <div className="flex shrink-0 items-center">
          <button
            onClick={() => {
              setSavedNote(false)
              setStarting(true)
            }}
            className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-all hover:brightness-110"
          >
            Start round
          </button>
        </div>
        {savedNote && (
          <Toast ms={SAVED_TOAST_MS} onDone={clearSavedNote}>
            Round saved. <SyncStatus className="mr-2" />
            <Link href="/rounds" className="font-semibold text-accent hover:underline">
              View rounds
            </Link>
          </Toast>
        )}
        {starting && (
          <StartRoundSheet
            {...props}
            onClose={() => setStarting(false)}
            onStart={(r) => {
              onRoundChange(r)
              setStarting(false)
              onGoToHole(r.startHole)
            }}
          />
        )}
      </>
    )
  }

  if (round.course.id !== course.id) {
    return (
      <p className="flex min-w-0 items-center gap-x-3 text-sm text-fg-2">
        <span className="min-w-0 truncate">Round in progress at {round.course.name}.</span>
        <button onClick={() => onResume(round.course, nextUnscored(round) ?? round.startHole)} className="h-11 shrink-0 font-semibold text-accent hover:underline">
          Resume
        </button>
      </p>
    )
  }

  const scored = round.holes.filter((h): h is ScoredHole => h.strokes != null)
  const summary = summarizeHoles(scored)

  const body = (
    <>
      {offlineToast && props.offlineReport && (
        <Toast ms={props.offlineReport.failed.length > 0 ? OFFLINE_FAILED_TOAST_MS : OFFLINE_TOAST_MS} onDone={clearOfflineToast} top={props.embedded}>
          {props.offlineReport.failed.length > 0
            ? `Not saved for offline: ${props.offlineReport.failed.join(", ")}. Start with signal to save them.`
            : "Saved for offline: course map, tees, your shots."}
        </Toast>
      )}

      {props.holeOffer != null && (
        <Toast ms={HOLE_OFFER_TOAST_MS} onDone={declineOffer} top={props.embedded}>
          <button onClick={() => onHoleOffer(true)} className="min-h-[44px] px-2 text-sm font-semibold text-accent">
            On hole {props.holeOffer}?
          </button>
        </Toast>
      )}

      {sheet?.kind === "hole" && (
        <HoleSheet
          round={round}
          holeNumber={sheet.hole}
          advance={!!sheet.advance}
          onRoundChange={onRoundChange}
          onSheetChange={onSheetChange}
          onGoToHole={onGoToHole}
          ball={sheet.hole === props.currentHole ? props.ball : null}
          onMissedSwing={() => {
            onSheetChange(null)
            props.onMissedSwing()
          }}
        />
      )}
      {sheet?.kind === "card" && <ScorecardSheet round={round} onSheetChange={onSheetChange} />}
      {sheet?.kind === "finish" && (
        <FinishSheet
          round={round}
          ending={!!sheet.ending}
          signedIn={signedIn}
          userId={props.userId}
          obAnswered={props.obAnswered}
          onObAnswer={props.onObAnswer}
          onRoundChange={onRoundChange}
          onSheetChange={onSheetChange}
          onSaved={() => {
            onRoundChange(null)
            onSheetChange(null)
            setSavedNote(true)
          }}
        />
      )}
    </>
  )
  // On the round screen the header and dock are the screen's own: only the toasts and sheets remain.
  if (props.embedded) return body

  return (
    <>
      <div className="flex min-w-0 items-center gap-3">
        {props.shot && (
          <button
            onClick={props.shot.onTap}
            disabled={props.shot.disabled}
            className="h-10 shrink-0 rounded-lg border border-accent px-5 text-sm font-semibold text-accent transition-all hover:brightness-110 disabled:opacity-50"
          >
            Shot{props.shot.club ? ` · ${props.shot.club}` : ""}
          </button>
        )}
        <button
          onClick={() => onSheetChange({ kind: "hole", hole: holeToScore(round, props.currentHole), advance: true })}
          className="h-10 shrink-0 rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent transition-all hover:brightness-110"
        >
          Hole done
        </button>
        <p className="min-w-0 truncate text-sm text-fg-3">
          {round.teeName ? `${round.teeName} · ` : ""}
          {scored.length === 0 ? `Holes ${describeOrder(round.holes.map((h) => h.hole_number))}` : `Thru ${scored.length} · ${formatToPar(summary.score - summary.par)}`}
        </p>
      </div>
      {body}
    </>
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
  const [card, setCard] = useState<Scorecard | null>(null) // the scorecard's pars and stroke indexes, once fetched (null if none)
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
  const [trackShots, setTrackShots] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Both come from the course's snapshots when there is no signal (null if the course was never saved).
    const scorecard = fetchWithSnapshot<Scorecard>(`/api/courses/${encodeURIComponent(course.id)}/scorecard`, snapshotKeys.scorecard(course.id)).catch(() => null)
    fetchWithSnapshot<{ tees?: OpenGolfApiTee[] }>(`/api/courses/${course.id}/tees`, snapshotKeys.tees(course.id))
      .then(async (d) => {
        const cardNow = await scorecard
        if (cancelled) return
        setCard(cardNow)
        const options = teeOptionsFrom((d?.tees ?? []) as OpenGolfApiTee[])
        setTees(options)
        if (options.length === 0) return
        // The tee already picked for this course, else the best fit for the bag.
        const stored = loadTeeChoice(course.id)
        const best = recommendTee({ handicapIndex: handicapIndex ?? 0, driverCarryYds: driveYdsFor(driverCarryYds, handicapIndex) }, options).recommended.tee.name
        setTeeName(options.some((t) => t.name === stored) ? stored : best)
      })
      .catch(() => !cancelled && setTees([]))
    return () => {
      cancelled = true
    }
  }, [course.id, driverCarryYds, handicapIndex])

  const count = countChoice === "other" ? parseInt(otherCount) : parseInt(countChoice)
  const countOk = Number.isInteger(count) && count >= 1 && count <= total
  const order = countOk ? playOrder(startHole, count, total) : []
  const tee = tees?.find((t) => t.name === teeName) ?? null

  function start() {
    if (!countOk) return
    // Par and stroke index from the scorecard where it has the hole, else the map's par.
    const parByHole: Record<number, number | null> = {}
    for (const h of courseHoles) if (h.ref != null) parByHole[h.ref] = h.par
    const onCard = new Map((card?.holes ?? []).map((h) => [h.number, h]))
    for (const [n, h] of onCard) parByHole[n] = h.par
    if (tee) {
      saveTeeChoice(course.id, tee.name)
    }
    onStart({
      id: newRoundId(), // the round's identity from now on (becomes rounds.id)
      course,
      date: localDate(),
      startedAt: Date.now(),
      teeName: tee?.name ?? null,
      courseRating: tee?.courseRating ?? null,
      slopeRating: tee?.slopeRating ?? null,
      startHole,
      trackShots,
      holes: holesFor(order, parByHole).map((h) => ({ ...h, stroke_index: onCard.get(h.hole_number)?.strokeIndex ?? null })),
    })
  }

  return (
    <BottomSheet
      label="Start round"
      title={course.name}
      onClose={onClose}
      footer={
        <>
          <p className="text-sm text-fg-3">
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
        </>
      }
    >
      <TrackShotsToggle onChange={setTrackShots} />

      <section className="space-y-2">
        <p className="label-xs">Tees</p>
        {tees === null && <p className="text-sm text-muted">Loading tees…</p>}
        {tees?.length === 0 && <p className="text-sm text-fg-3">No tee data for this course. Add the rating and slope when you finish.</p>}
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
                    <span className="block text-xs text-muted">
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
    </BottomSheet>
  )
}
