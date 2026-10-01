"use client"

import { useEffect, useState } from "react"
import type { CourseRef } from "@/lib/golfer/baseline"

/**
 * A course name box that searches OpenGolfAPI as you type (debounced, like
 * the planner's and setup's search). Picking a result calls `onPick`; typing
 * anything else is still allowed (a course that isn't listed).
 */
export function CourseSearch({
  value,
  onChange,
  onPick,
  inputClassName,
  placeholder = "Find a course",
}: {
  value: string
  onChange: (text: string) => void
  onPick: (course: CourseRef) => void
  inputClassName: string
  placeholder?: string
}) {
  const [hits, setHits] = useState<CourseRef[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const q = value.trim()
    if (!open || q.length < 3) {
      setHits([])
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        const data = await res.json()
        setError(res.ok ? "" : data?.error ?? "Search failed.")
        setHits((data.courses ?? []) as CourseRef[])
      } catch {
        /* aborted or offline: free text still works */
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [value, open])

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        placeholder={placeholder}
        aria-label="Course"
        className={inputClassName}
      />
      {open && value.trim().length >= 3 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 divide-y divide-fg/[0.06] overflow-y-auto rounded-lg border border-fg/[0.08] bg-page shadow-2xl">
          {searching && hits.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">Searching…</li>}
          {!searching && hits.length === 0 && <li className="px-3 py-2.5 text-sm text-muted">{error || "Not listed: keep typing to use this name."}</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(h)
                  setOpen(false)
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
    </div>
  )
}
