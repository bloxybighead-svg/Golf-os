"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { CLUB_CATALOG } from "@/lib/golfer/bag"
import type { Club } from "@/lib/golfer/tables"
import {
  SETTINGS_KEY,
  LAST_POSITION_KEY,
  applyBaselineToDevice,
  cleanCarries,
  cleanHandicap,
  type Baseline,
  type CourseRef,
} from "@/lib/golfer/baseline"
import { saveBaseline } from "@/app/welcome/actions"

const MAIN_CLUBS: Club[] = ["Driver", "7-Iron"]
const OTHER_CLUBS = CLUB_CATALOG.filter((c) => !MAIN_CLUBS.includes(c))

const INPUT =
  "h-11 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg tabular-nums placeholder:text-faint focus:border-accent/60 focus:outline-none"

export function WelcomeClient({
  initial,
  trackedHandicap,
  signedIn,
}: {
  initial: Baseline | null
  trackedHandicap: number | null
  signedIn: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState<"numbers" | "rounds">("numbers")
  const [handicap, setHandicap] = useState(initial?.handicapIndex != null ? String(initial.handicapIndex) : "")
  const [carries, setCarries] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial?.carries ?? {}).map(([k, v]) => [k, String(v)]))
  )
  const [moreClubs, setMoreClubs] = useState(OTHER_CLUBS.some((c) => initial?.carries[c] != null))
  const [home, setHome] = useState<CourseRef | null>(initial?.homeCourse ?? null)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<CourseRef[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // No saved baseline: prefill from anything already set up on this device,
  // falling back to the account's tracked handicap.
  useEffect(() => {
    if (initial) return
    if (trackedHandicap != null) setHandicap(String(trackedHandicap))
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}")
      if (s.source !== "handicap") return
      if (s.handicap != null) setHandicap(String(s.handicap))
      const c: Record<string, string> = {}
      for (const [k, v] of Object.entries((s.carries ?? {}) as Record<string, number>)) c[k] = String(v)
      if (s.driverCarry) c.Driver = s.driverCarry
      if (s.sevenIronCarry) c["7-Iron"] = s.sevenIronCarry
      setCarries(c)
      const last = JSON.parse(localStorage.getItem(LAST_POSITION_KEY) ?? "null")
      if (last?.course?.id) setHome(last.course)
    } catch {
      /* nothing to prefill */
    }
  }, [initial, trackedHandicap])

  // Course search, debounced like the planner's.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setHits([])
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        setHits(((await res.json()).courses ?? []) as CourseRef[])
      } catch {
        /* aborted or offline */
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [query])

  async function save() {
    setError("")
    const baseline: Baseline = { handicapIndex: cleanHandicap(handicap), carries: cleanCarries(carries), homeCourse: home }
    applyBaselineToDevice(baseline)
    if (signedIn) {
      setSaving(true)
      try {
        await saveBaseline({ handicapIndex: handicap, carries, homeCourse: home })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save to your account.")
        setSaving(false)
        return
      }
      setSaving(false)
    }
    setStep("rounds")
  }

  const carryInput = (club: Club) => (
    <label key={club} className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{club}</span>
      <input
        type="number"
        inputMode="numeric"
        placeholder="yd"
        value={carries[club] ?? ""}
        onChange={(e) => setCarries((prev) => ({ ...prev, [club]: e.target.value }))}
        className={INPUT}
      />
    </label>
  )

  if (step === "rounds") {
    return (
      <div className="mx-auto max-w-lg space-y-5 pt-4">
        <h2 className="text-2xl font-bold tracking-tight text-fg">Got past rounds?</h2>
        <p className="text-sm text-fg-3">Adding them fills in your handicap and trends.</p>
        <div className="flex flex-wrap gap-2">
          {signedIn ? (
            <Link href="/rounds?new=1" className="flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent">
              Add rounds
            </Link>
          ) : (
            <Link
              href="/login?redirect=%2Frounds%3Fnew%3D1"
              className="flex h-11 items-center rounded-lg bg-accent px-5 text-sm font-semibold text-on-accent"
            >
              Sign in to add rounds
            </Link>
          )}
          <button
            onClick={() => {
              router.push("/")
              router.refresh()
            }}
            className="h-11 rounded-lg border border-fg/[0.08] px-5 text-sm font-semibold text-fg-2 hover:text-fg"
          >
            Go play
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-7 pt-4">
      <h2 className="text-2xl font-bold tracking-tight text-fg">Set up</h2>

      <section className="space-y-2">
        <p className="label-xs">Handicap</p>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="Best guess is fine"
          value={handicap}
          onChange={(e) => setHandicap(e.target.value)}
          aria-label="Handicap"
          className={`${INPUT} max-w-[12rem]`}
        />
      </section>

      <section className="space-y-2">
        <p className="label-xs">Carry distances</p>
        <div className="grid grid-cols-2 gap-3">{MAIN_CLUBS.map(carryInput)}</div>
        {moreClubs ? (
          <div className="grid grid-cols-3 gap-3 pt-1 sm:grid-cols-4">{OTHER_CLUBS.map(carryInput)}</div>
        ) : (
          <button onClick={() => setMoreClubs(true)} className="min-h-[44px] text-sm font-semibold text-accent hover:underline">
            Add more clubs
          </button>
        )}
      </section>

      <section className="space-y-2">
        <p className="label-xs">Home course</p>
        {home ? (
          <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-fg/[0.08] bg-surface px-3">
            <span className="min-w-0 truncate text-sm text-fg">{home.name}</span>
            <button onClick={() => setHome(null)} className="shrink-0 text-sm text-muted hover:text-fg">
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a course"
              aria-label="Find your home course"
              className={INPUT}
            />
            {query.trim().length >= 3 && (
              <ul className="divide-y divide-fg/[0.06] rounded-lg border border-fg/[0.08] bg-surface">
                {searching && hits.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">Searching…</li>}
                {!searching && hits.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">No courses found.</li>}
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => {
                        setHome(h)
                        setQuery("")
                      }}
                      className="flex min-h-[44px] w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-fg/[0.04]"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{h.name}</span>
                      <span className="shrink-0 text-xs text-muted">{[h.city, h.state].filter(Boolean).join(", ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-on-accent transition-all hover:brightness-110 disabled:opacity-50"
      >
        {saving && <Loader2 size={15} className="animate-spin" />}
        Save
      </button>
    </div>
  )
}
