"use client"

// A first visit to Play: find your course (near you or by name), then three
// optional numbers. Choosing "demo" opens Pebble Beach as before.

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import type { Baseline, CourseRef } from "@/lib/golfer/baseline"
import { cleanCarries, cleanHandicap } from "@/lib/golfer/baseline"

type Hit = CourseRef & { distanceMi?: number | null }

const INPUT =
  "h-11 w-full rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"

export function FirstRun({ onDone, onDemo }: { onDone: (course: CourseRef, baseline: Baseline) => Promise<void>; onDemo: () => void }) {
  const [course, setCourse] = useState<CourseRef | null>(null)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [handicap, setHandicap] = useState("")
  const [driver, setDriver] = useState("")
  const [seven, setSeven] = useState("")
  const [saving, setSaving] = useState(false)

  async function load(params: string, signal?: AbortSignal) {
    setBusy(true)
    try {
      const res = await fetch(`/api/courses/search?${params}`, { signal })
      const data = await res.json()
      setHits(res.ok ? (data.courses ?? []) : [])
      setNote(res.ok ? (data.courses?.length ? "" : "No courses found.") : (data?.error ?? "Search failed."))
    } catch {
      /* aborted or offline */
    } finally {
      setBusy(false)
    }
  }

  // Name search, debounced.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) return
    const ctl = new AbortController()
    const t = setTimeout(() => void load(`q=${encodeURIComponent(q)}`, ctl.signal), 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [query])

  // One permission prompt, only when the golfer taps the button.
  function locate() {
    setNote("")
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => void load(`lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`),
      () => {
        setBusy(false)
        setNote("Location is off. Search by name instead.")
      },
      { timeout: 10000 }
    )
  }

  async function start() {
    if (!course) return
    setSaving(true)
    await onDone(course, {
      handicapIndex: cleanHandicap(handicap),
      carries: cleanCarries({ Driver: driver, "7-Iron": seven }),
      homeCourse: course,
    })
  }

  return (
    <div className="fixed inset-0 z-[1600] overflow-y-auto bg-page px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-lg space-y-5 py-8">
        {!course ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Find your course</h1>
            <button
              onClick={locate}
              disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              Use my location
            </button>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              aria-label="Search by course name"
              className={INPUT}
            />
            {note && <p className="text-sm text-muted">{note}</p>}
            {hits.length > 0 && (
              <ul className="divide-y divide-fg/[0.06] rounded-lg border border-fg/[0.08] bg-surface">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button onClick={() => setCourse({ id: h.id, name: h.name, city: h.city, state: h.state, par: h.par, lat: h.lat, lng: h.lng })} className="flex min-h-[44px] w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-fg/[0.04]">
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{h.name}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {h.distanceMi != null ? `${h.distanceMi.toFixed(1)} mi` : [h.city, h.state].filter(Boolean).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={onDemo} className="flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline">
              Just show me a demo
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Your numbers</h1>
            <p className="truncate text-sm text-fg-3">{course.name}</p>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Handicap</span>
              <input type="number" inputMode="decimal" step="0.1" value={handicap} onChange={(e) => setHandicap(e.target.value)} className={`${INPUT} max-w-[12rem]`} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Driver carry (yd)</span>
                <input type="number" inputMode="numeric" value={driver} onChange={(e) => setDriver(e.target.value)} className={INPUT} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">7-iron carry (yd)</span>
                <input type="number" inputMode="numeric" value={seven} onChange={(e) => setSeven(e.target.value)} className={INPUT} />
              </label>
            </div>
            <button
              onClick={start}
              disabled={saving}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              Start on hole 1
            </button>
            <button onClick={() => setCourse(null)} className="flex min-h-[44px] items-center text-sm font-semibold text-fg-2 hover:text-fg">
              Change course
            </button>
          </>
        )}
      </div>
    </div>
  )
}
