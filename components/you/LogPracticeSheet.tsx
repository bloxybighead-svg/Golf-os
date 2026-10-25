"use client"

import { useState } from "react"
import { BottomSheet } from "@/components/play/BottomSheet"
import { PRACTICE_RUN_JOB, practiceRunKey } from "@/lib/offline/jobs"
import { queueJob } from "@/lib/offline/outbox"
import { loggedRunPayload } from "@/lib/practice/logged"
import { newRoundId } from "@/lib/rounds/activeRound"
import type { LibraryDrill } from "@/lib/supabase/types"

const FREE_PRACTICE = "Free practice"
const FIELD =
  "h-11 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
const OPTION = "flex min-h-11 w-full items-center px-3 text-left text-sm text-fg hover:bg-fg/[0.04]"

export function LogPracticeSheet({ library, userId }: { library: LibraryDrill[]; userId: string | null }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(FREE_PRACTICE)
  const [listOpen, setListOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [drillId, setDrillId] = useState<string | null>(null)
  const [minutes, setMinutes] = useState("")
  const [score, setScore] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const needle = typed ? query.trim().toLowerCase() : ""
  const matches = library.filter((d) => d.name.toLowerCase().includes(needle))
  const showFree = FREE_PRACTICE.toLowerCase().includes(needle)

  function pick(id: string | null, name: string) {
    setDrillId(id)
    setQuery(name)
    setTyped(false)
    setListOpen(false)
  }

  const drill = library.find((d) => d.id === drillId) ?? null

  async function save() {
    const mins = Number(minutes)
    if (!userId) return
    if (!Number.isInteger(mins) || mins < 1 || mins > 600) return setError("Minutes must be a whole number from 1 to 600.")
    const points = score.trim() === "" ? null : Number(score)
    if (points != null && !Number.isFinite(points)) return setError("Enter the score as a number.")
    setError(null)
    setSaving(true)
    const payload = loggedRunPayload({ id: newRoundId(), userId, drill, minutes: mins, score: drill ? points : null, now: new Date() })
    const queued = await queueJob({ key: practiceRunKey(payload.run.id), kind: PRACTICE_RUN_JOB, payload })
    setSaving(false)
    if (!queued) return setError("Couldn't save.")
    setOpen(false)
    pick(null, FREE_PRACTICE)
    setMinutes("")
    setScore("")
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent transition-all hover:brightness-110"
      >
        Log practice
      </button>

      {open && (
        <BottomSheet
          label="Log practice"
          title="Log practice"
          onClose={() => setOpen(false)}
          footer={
            <>
              {!userId && <p className="text-xs text-warn">Sign in to log practice.</p>}
              {error && <p className="text-xs text-danger">{error}</p>}
              <button
                onClick={() => void save()}
                disabled={!userId || saving}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="space-y-1.5">
            <label htmlFor="practice-drill" className="text-xs text-muted">Drill</label>
            <input
              id="practice-drill"
              role="combobox"
              aria-expanded={listOpen}
              aria-controls="practice-drill-list"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setDrillId(null)
                setTyped(true)
                setListOpen(true)
              }}
              onFocus={(e) => {
                e.target.select()
                setListOpen(true)
              }}
              className={FIELD}
            />
            {listOpen && (showFree || matches.length > 0) && (
              <ul id="practice-drill-list" role="listbox" className="max-h-48 divide-y divide-fg/[0.06] overflow-y-auto rounded-lg border border-fg/[0.08]">
                {showFree && (
                  <li role="option" aria-selected={drillId === null}>
                    <button type="button" onClick={() => pick(null, FREE_PRACTICE)} className={OPTION}>{FREE_PRACTICE}</button>
                  </li>
                )}
                {matches.map((d) => (
                  <li key={d.id} role="option" aria-selected={drillId === d.id}>
                    <button type="button" onClick={() => pick(d.id, d.name)} className={OPTION}>{d.name}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="practice-minutes" className="text-xs text-muted">Minutes</label>
            <input
              id="practice-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={FIELD}
            />
          </div>

          {drill && drill.metric !== "pct" && (
            <div className="space-y-1.5">
              <label htmlFor="practice-score" className="text-xs text-muted">Score (optional)</label>
              <input
                id="practice-score"
                type="number"
                inputMode="decimal"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className={FIELD}
              />
            </div>
          )}
        </BottomSheet>
      )}
    </>
  )
}
