"use client"

// Score entry for one set, sized to the metric:
//   count_of_n  a row of big number buttons, 0..balls; one tap saves
//   streak      a stepper from 0 with a big +1
//   strokes     a stepper
//   pct         two steppers, made and attempts
//   Club Work   a left / center / right counter for the club
//   close-out   Made / Missed: a miss restarts the count (the pass-to-leave rule); the putts taken are the score

import { useState } from "react"
import type { RunStep } from "@/lib/practice/activeSession"
import { closeoutPutt } from "@/lib/practice/runner"

export interface EntryInput {
  value: number
  attempts?: number
  spread?: { left: number; center: number; right: number }
}

const BIG = "flex min-h-14 items-center justify-center rounded-lg border border-fg/[0.08] bg-surface text-xl font-semibold text-fg transition-colors hover:bg-fg/[0.04]"
const PRIMARY = "flex min-h-14 w-full items-center justify-center rounded-lg bg-accent text-lg font-semibold text-on-accent transition-all hover:brightness-110"

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,2fr)] items-center gap-2">
        <button type="button" aria-label={`${label} minus one`} onClick={() => onChange(Math.max(0, value - 1))} className={BIG}>
          −1
        </button>
        <p className="text-center text-4xl font-semibold tabular-nums text-fg" aria-live="polite">
          {value}
        </p>
        <button type="button" aria-label={`${label} plus one`} onClick={() => onChange(value + 1)} className={`${BIG} border-accent/40 bg-accent/10 text-accent`}>
          +1
        </button>
      </div>
    </div>
  )
}

function caption(step: RunStep): string {
  const what =
    step.kind === "closeout"
      ? "Putts to make them in a row"
      : step.metric === "count_of_n"
        ? `Out of ${step.balls}`
        : step.metric === "streak"
          ? "Best streak"
          : step.metric === "strokes"
            ? "Total putts"
            : "Made of attempts"
  return [what, step.levelName, step.lowerIsBetter ? "lower is better" : "higher is better"].filter(Boolean).join(" · ")
}

export function ScoreEntry({ step, onSave }: { step: RunStep; onSave: (input: EntryInput) => void }) {
  const [n, setN] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [spread, setSpread] = useState({ left: 0, center: 0, right: 0 })
  const [closeout, setCloseout] = useState({ made: 0, putts: 0 })
  const [shake, setShake] = useState(0)

  let body
  if (step.kind === "closeout") {
    const putt = (made: boolean) => {
      const r = closeoutPutt(closeout, made, step.balls)
      setCloseout(r.state)
      if (r.passed) onSave({ value: r.state.putts })
      else if (!made) setShake(shake + 1)
    }
    body = (
      <>
        <p className={`text-center text-5xl font-semibold tabular-nums text-fg ${shake ? "run-shake" : ""}`} key={shake} aria-live="polite">
          {closeout.made} of {step.balls}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`${BIG} min-h-16 border-accent/40 bg-accent/10 text-accent`} onClick={() => putt(true)}>
            Made
          </button>
          <button type="button" className={`${BIG} min-h-16`} onClick={() => putt(false)}>
            Missed
          </button>
        </div>
        <p className="text-center text-xs text-muted">{closeout.putts} putts so far</p>
      </>
    )
  } else if (step.club) {
    const total = spread.left + spread.center + spread.right
    const bump = (k: keyof typeof spread) => total < step.balls && setSpread({ ...spread, [k]: spread[k] + 1 })
    body = (
      <>
        <div className="grid grid-cols-3 gap-2">
          {(["left", "center", "right"] as const).map((k) => (
            <button key={k} type="button" onClick={() => bump(k)} className={`${BIG} min-h-24 flex-col gap-1`}>
              <span className="text-3xl tabular-nums">{spread[k]}</span>
              <span className="text-xs font-normal capitalize text-muted">{k}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
          <button type="button" className={BIG} onClick={() => setSpread({ left: 0, center: 0, right: 0 })}>
            Reset
          </button>
          <button type="button" className={PRIMARY} onClick={() => onSave({ value: spread.center, spread })}>
            Save {step.club}
          </button>
        </div>
      </>
    )
  } else if (step.metric === "count_of_n") {
    body = (
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: step.balls + 1 }, (_, i) => (
          <button key={i} type="button" onClick={() => onSave({ value: i })} className={BIG}>
            {i}
          </button>
        ))}
      </div>
    )
  } else if (step.metric === "pct") {
    body = (
      <>
        <Stepper label="Made" value={n} onChange={setN} />
        <Stepper label="Attempts" value={attempts} onChange={setAttempts} />
        <button type="button" className={PRIMARY} disabled={attempts < n || attempts === 0} onClick={() => onSave({ value: n, attempts })}>
          Save
        </button>
      </>
    )
  } else {
    body = (
      <>
        <Stepper label={step.metric === "streak" ? "Streak" : "Putts"} value={n} onChange={setN} />
        <button type="button" className={PRIMARY} onClick={() => onSave({ value: n })}>
          Save
        </button>
      </>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{step.club ? `${step.club} · center is inside the window · ${step.lowerIsBetter ? "lower" : "higher"} is better` : caption(step)}</p>
      {body}
    </div>
  )
}
