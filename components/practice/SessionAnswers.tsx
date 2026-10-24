"use client"

// The three questions before a session, one tap each, and the next round tucked away below them.

import { useState, type ReactNode } from "react"
import { LOCATION_CHOICES, MINUTE_CHOICES, localDate, nextRoundLabel, type Answers, type StoredNextRound } from "@/lib/practice/startSession"

const CHOICE = "flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors disabled:opacity-40"
const ON = "border-accent bg-accent text-on-accent"
const OFF = "border-fg/[0.08] bg-surface text-fg hover:bg-fg/[0.04]"
const FIELD = "h-11 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg focus:border-accent/60 focus:outline-none"

function Row({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">{title}</p>
      {children}
      {note && <p className="text-xs text-fg-2">{note}</p>}
    </div>
  )
}

function Choices<T extends string | boolean>({ value, options, onPick }: { value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([v, label]) => (
        <button key={label} type="button" aria-pressed={value === v} className={`${CHOICE} ${value === v ? ON : OFF}`} onClick={() => onPick(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function SessionAnswers({
  answers,
  cap,
  nextRound,
  today,
  onAnswers,
  onNextRound,
}: {
  answers: Answers
  cap: number
  nextRound: StoredNextRound | null
  today: Date
  onAnswers: (a: Answers) => void
  onNextRound: (r: StoredNextRound | null) => void
}) {
  const [other, setOther] = useState(!(MINUTE_CHOICES as readonly number[]).includes(answers.minutes))
  const [roundOpen, setRoundOpen] = useState(false)

  return (
    <div className="space-y-5">
      <Row title="Minutes" note={cap < Math.max(...MINUTE_CHOICES) ? `Until 8:45 pm: ${cap} min max` : undefined}>
        <div className="grid grid-cols-5 gap-2">
          {MINUTE_CHOICES.map((m) => {
            const picked = !other && answers.minutes === m
            return (
              <button
                key={m}
                type="button"
                aria-pressed={picked}
                disabled={m > cap}
                className={`${CHOICE} ${picked ? ON : OFF}`}
                onClick={() => {
                  setOther(false)
                  onAnswers({ ...answers, minutes: m })
                }}
              >
                {m}
              </button>
            )
          })}
          <button type="button" aria-pressed={other} className={`${CHOICE} ${other ? ON : OFF}`} onClick={() => setOther(true)}>
            Other
          </button>
        </div>
        {other && (
          <input
            aria-label="Minutes"
            type="number"
            inputMode="numeric"
            min={10}
            max={cap}
            value={answers.minutes || ""}
            onChange={(e) => onAnswers({ ...answers, minutes: Math.min(cap, Math.max(0, Math.round(Number(e.target.value)) || 0)) })}
            className={FIELD}
          />
        )}
      </Row>

      <Row title="Locations" note="Pick every place you can practise today">
        <div className="grid grid-cols-2 gap-2">
          {LOCATION_CHOICES.map((l) => {
            const picked = answers.locations.includes(l.value)
            return (
              <button
                key={l.value}
                type="button"
                aria-pressed={picked}
                className={`${CHOICE} ${picked ? ON : OFF}`}
                onClick={() => {
                  // Always at least one place.
                  const next = picked ? answers.locations.filter((x) => x !== l.value) : [...answers.locations, l.value]
                  if (next.length > 0) onAnswers({ ...answers, locations: next })
                }}
              >
                {l.label}
              </button>
            )
          })}
        </div>
      </Row>

      <Row title="How you feel">
        <Choices value={answers.energy} options={[["ok", "Good"], ["pain", "Sore"]] as const} onPick={(energy) => onAnswers({ ...answers, energy })} />
      </Row>

      <div className="border-t border-fg/[0.06] pt-3">
        <button type="button" aria-expanded={roundOpen} onClick={() => setRoundOpen(!roundOpen)} className="flex min-h-11 w-full items-center text-left text-sm text-fg-2">
          {nextRoundLabel(nextRound)}
        </button>
        {roundOpen && (
          <div className="space-y-3 pb-1">
            <input
              aria-label="Next round date"
              type="date"
              min={localDate(today)}
              value={nextRound?.date ?? ""}
              onChange={(e) => onNextRound(e.target.value ? { competitive: false, courseKnown: true, ...nextRound, date: e.target.value } : null)}
              className={FIELD}
            />
            {nextRound && (
              <>
                <Choices value={nextRound.competitive} options={[[true, "Competitive"], [false, "Casual"]] as const} onPick={(competitive) => onNextRound({ ...nextRound, competitive })} />
                <Choices value={nextRound.courseKnown} options={[[true, "Known course"], [false, "New course"]] as const} onPick={(courseKnown) => onNextRound({ ...nextRound, courseKnown })} />
                <button type="button" className="text-xs text-muted underline underline-offset-2" onClick={() => onNextRound(null)}>
                  Clear next round
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
