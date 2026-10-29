"use client"

// "Start session": the button on Practice (or "Resume session" with one running), the questions, and the
// session card the answers build. Start hands the plan to the runner.

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { BottomSheet } from "@/components/play/BottomSheet"
import { useActiveSession } from "@/hooks/useActiveSession"
import type { PracticeWeek } from "@/hooks/usePracticeWeek"
import { SESSION_PATH, isOldSession, isUnsaved } from "@/lib/practice/activeSession"
import { discardSession } from "@/lib/practice/discard"
import { endEarly } from "@/lib/practice/runner"
import type { DrillRef } from "@/lib/practice/runs"
import { cutoffCapMinutes, type SessionPlan } from "@/lib/practice/session"
import {
  ANSWERS_KEY,
  DEFAULT_ANSWERS,
  NEXT_ROUND_KEY,
  beginSession,
  buildPlan,
  fitMinutes,
  initialFocus,
  liveNextRound,
  localDate,
  startFromPlan,
  type Answers,
  type StoredNextRound,
} from "@/lib/practice/startSession"
import type { PracticeArea } from "@/lib/practice/weakness"
import { setRoundPaused } from "@/lib/rounds/roundMode"
import type { LibraryDrill } from "@/lib/supabase/types"
import { SessionAnswers } from "./SessionAnswers"
import { SessionCard } from "./SessionCard"

const BUTTON = "flex min-h-14 w-full items-center justify-center rounded-lg bg-accent text-lg font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not remembered; the answers still work this time.
  }
}

export function StartSession({
  focusRequest,
  week,
  library,
  activeLibrary,
  levels,
  levelSince,
  userId,
}: {
  focusRequest?: { area: PracticeArea } | null
  week: PracticeWeek | null
  library: DrillRef[]
  activeLibrary: LibraryDrill[]
  levels: Record<string, number>
  levelSince: Record<string, string>
  userId: string | null
}) {
  const router = useRouter()
  const { session, update } = useActiveSession()
  const [asked, setAsked] = useState(false)
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<SessionPlan | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS)
  const [nextRound, setNextRound] = useState<StoredNextRound | null>(null)

  const requested = useRef<PracticeArea | null>(null)

  useEffect(() => {
    if (!focusRequest) return
    requested.current = focusRequest.area
    setOpen(true)
  }, [focusRequest])

  useEffect(() => {
    if (!open) return
    const at = new Date()
    setNow(at)
    setPlan(null)
    // An older save kept one location.
    const saved = read<Partial<Answers> & { savedOn?: string; location?: Answers["locations"][number] }>(ANSWERS_KEY) ?? {}
    setAnswers({
      minutes: fitMinutes(saved.minutes ?? DEFAULT_ANSWERS.minutes, cutoffCapMinutes(at)),
      locations: saved.locations?.length ? saved.locations : saved.location ? [saved.location] : DEFAULT_ANSWERS.locations,
      energy: saved.energy ?? DEFAULT_ANSWERS.energy,
      // Focus is remembered for the day it was picked, then goes back to Auto.
      focus: initialFocus(requested.current, saved, at),
    })
    requested.current = null
    const next = liveNextRound(read<StoredNextRound>(NEXT_ROUND_KEY), at)
    write(NEXT_ROUND_KEY, next)
    setNextRound(next)
  }, [open])

  const cap = useMemo(() => cutoffCapMinutes(now), [now])

  if (session) {
    return (
      <>
        <button
          id="start-session"
          type="button"
          className={BUTTON}
          onClick={() => {
            setRoundPaused(false)
            router.push(SESSION_PATH)
          }}
        >
          {isUnsaved(session) ? "Finish last session" : "Resume session"}
        </button>
        {!asked && isOldSession(session) && (
          <BottomSheet
            label="Last session"
            title="Last session"
            onClose={() => setAsked(true)}
            footer={
              <>
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    update(endEarly)
                    setRoundPaused(false)
                    router.push(SESSION_PATH)
                  }}
                >
                  Save
                </button>
                <button type="button" className="flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-fg hover:bg-fg/[0.04]" onClick={() => void discardSession(session.id, router.push)}>
                  Discard
                </button>
              </>
            }
          >
            <p className="text-sm text-fg-2">From {session.date}, never saved.</p>
          </BottomSheet>
        )}
      </>
    )
  }

  const build = () => {
    const at = new Date()
    write(ANSWERS_KEY, { ...answers, savedOn: localDate(at) })
    setNow(at)
    setPlan(buildPlan({ week: week?.view.week.items ?? [], now: at, answers, nextRound, runs: week?.runs ?? [], library: activeLibrary, levels }))
  }

  const start = () => {
    if (!plan) return
    beginSession(startFromPlan({ plan, now: new Date(), locations: answers.locations, userId: userId ?? "", runs: week?.runs ?? [], library, levels, levelSince }), router)
  }

  return (
    <>
      <button id="start-session" type="button" className={BUTTON} onClick={() => setOpen(true)}>
        Start session
      </button>
      {open && (
        <BottomSheet
          label="Start session"
          title={plan ? "Your session" : "Start session"}
          onClose={() => setOpen(false)}
          footer={
            plan ? (
              <>
                {plan.blocks.length > 0 && (
                  <button type="button" className={BUTTON} onClick={start}>
                    Start
                  </button>
                )}
                <button type="button" className="flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-semibold text-fg hover:bg-fg/[0.04]" onClick={() => setPlan(null)}>
                  Change answers
                </button>
              </>
            ) : (
              <button type="button" className={BUTTON} disabled={answers.minutes < 10 || answers.locations.length === 0} onClick={build}>
                Build session
              </button>
            )
          }
        >
          {plan ? (
            <SessionCard plan={plan} locations={answers.locations} library={activeLibrary} />
          ) : (
            <SessionAnswers
              answers={answers}
              cap={cap}
              library={activeLibrary}
              nextRound={nextRound}
              today={now}
              onAnswers={setAnswers}
              onNextRound={(r) => {
                write(NEXT_ROUND_KEY, r)
                setNextRound(r)
              }}
            />
          )}
        </BottomSheet>
      )}
    </>
  )
}
