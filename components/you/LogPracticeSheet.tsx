"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BottomSheet } from "@/components/play/BottomSheet"
import { logPractice } from "@/app/drills/library-actions"
import type { LibraryDrill } from "@/lib/supabase/types"

const FREE_PRACTICE = "Free practice"
const FIELD =
  "h-11 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
const OPTION = "flex min-h-11 w-full items-center px-3 text-left text-sm text-fg hover:bg-fg/[0.04]"

export function LogPracticeSheet({ library, signedIn }: { library: LibraryDrill[]; signedIn: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(FREE_PRACTICE)
  const [listOpen, setListOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const [drillId, setDrillId] = useState<string | null>(null)
  const [minutes, setMinutes] = useState("")
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const needle = typed ? query.trim().toLowerCase() : ""
  const matches = library.filter((d) => d.name.toLowerCase().includes(needle))
  const showFree = FREE_PRACTICE.toLowerCase().includes(needle)

  function pick(id: string | null, name: string) {
    setDrillId(id)
    setQuery(name)
    setTyped(false)
    setListOpen(false)
  }

  function save() {
    const mins = Number(minutes)
    if (!Number.isInteger(mins) || mins < 1) return setError("Enter the minutes.")
    if (rating === 0) return setError("Rate it from 1 to 5.")
    setError(null)
    startTransition(async () => {
      try {
        await logPractice({ drillId, minutes: mins, rating, notes: notes.trim() || null, at: new Date().toISOString() })
        setOpen(false)
        pick(null, FREE_PRACTICE)
        setMinutes("")
        setRating(0)
        setNotes("")
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.")
      }
    })
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
              {!signedIn && <p className="text-xs text-warn">Sign in to log practice.</p>}
              {error && <p className="text-xs text-danger">{error}</p>}
              <button
                onClick={save}
                disabled={!signedIn || isPending}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
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
              className={`${FIELD} tabular-nums`}
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-muted">Rating</p>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  onClick={() => setRating(n)}
                  className={[
                    "h-11 rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                    rating === n ? "border-accent bg-accent text-on-accent" : "border-fg/[0.08] bg-surface text-fg hover:bg-fg/[0.04]",
                  ].join(" ")}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="practice-notes" className="text-xs text-muted">Notes</label>
            <textarea
              id="practice-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full resize-none rounded-lg border border-fg/[0.08] bg-surface px-3 py-2 text-sm text-fg focus:border-accent/60 focus:outline-none"
            />
          </div>
        </BottomSheet>
      )}
    </>
  )
}
