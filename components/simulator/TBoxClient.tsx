"use client"

import { useMemo, useState } from "react"
import { recommendTee, type TeeOption } from "@/lib/tbox/estimate"
import { Flag } from "lucide-react"
import PageHeader from "@/components/PageHeader"

export interface KnownCourse {
  courseName: string
  courseRating: number
  slopeRating: number
  par: number
}

interface Props {
  knownCourses: KnownCourse[]
  defaultDriverCarryYds?: number
}

const DEFAULT_TEES: TeeOption[] = [
  { name: "Black", totalYardage: 7000, courseRating: 74.0, slopeRating: 135, par: 72 },
  { name: "Blue", totalYardage: 6500, courseRating: 71.5, slopeRating: 128, par: 72 },
  { name: "White", totalYardage: 6000, courseRating: 69.0, slopeRating: 122, par: 72 },
]

interface CourseSearchResult {
  id: string
  name: string
  city: string | null
  state: string | null
  par: number | null
}

interface OpenGolfApiTee {
  tee_name: string
  gender: string
  course_rating: number
  slope: number
  par: number
  yardage: number
}

export function TBoxClient({ knownCourses, defaultDriverCarryYds }: Props) {
  const [handicapIndex, setHandicapIndex] = useState(10)
  const [driverCarryYds, setDriverCarryYds] = useState(defaultDriverCarryYds ?? 230)
  const [tees, setTees] = useState<TeeOption[]>(DEFAULT_TEES)
  const [activeCourseName, setActiveCourseName] = useState<string | null>(null)

  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingTees, setLoadingTees] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  async function searchCourses() {
    if (query.trim().length < 2) return
    setSearching(true)
    setSearchError(null)
    try {
      const res = await fetch(`/api/courses/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setSearchResults(data.courses ?? [])
    } catch {
      setSearchError("Search failed. Try again.")
    } finally {
      setSearching(false)
    }
  }

  async function loadRealCourse(course: CourseSearchResult) {
    setLoadingTees(true)
    setSearchError(null)
    try {
      const res = await fetch(`/api/courses/${course.id}/tees`)
      const data = await res.json()
      const realTees: TeeOption[] = (data.tees ?? []).map((t: OpenGolfApiTee) => ({
        name: t.gender === "Female" ? `${t.tee_name} (W)` : t.tee_name,
        totalYardage: t.yardage,
        courseRating: t.course_rating,
        slopeRating: t.slope,
        par: t.par,
      }))
      if (realTees.length === 0) {
        setSearchError(`${course.name} has no tee data yet. Enter it below.`)
        return
      }
      setTees(realTees)
      setActiveCourseName(course.name)
      setSearchResults([])
      setQuery("")
    } catch {
      setSearchError("Couldn't load tee data. Try again.")
    } finally {
      setLoadingTees(false)
    }
  }

  const result = useMemo(() => {
    try {
      return recommendTee({ handicapIndex, driverCarryYds }, tees)
    } catch {
      return null
    }
  }, [handicapIndex, driverCarryYds, tees])

  function updateTee(i: number, patch: Partial<TeeOption>) {
    setActiveCourseName(null) // no longer exactly the real course's tees once hand-edited
    setTees((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }

  function addTee() {
    setActiveCourseName(null)
    setTees((prev) => [...prev, { name: `Tee ${prev.length + 1}`, totalYardage: 6000, courseRating: 70, slopeRating: 125, par: 72 }])
  }

  function removeTee(i: number) {
    setTees((prev) => prev.filter((_, idx) => idx !== i))
  }

  function loadCourse(course: KnownCourse) {
    setActiveCourseName(null)
    setTees((prev) => [
      ...prev,
      { name: course.courseName, totalYardage: 6000, courseRating: course.courseRating, slopeRating: course.slopeRating, par: course.par },
    ])
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={Flag} title="Which tees" subtitle={<>Tees that fit your handicap and driver distance.</>} />

      <div className="flex flex-wrap gap-6 rounded-xl border border-fg/[0.06] bg-surface p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Handicap Index</span>
          <input
            type="number"
            step={0.1}
            value={handicapIndex}
            onChange={(e) => setHandicapIndex(Number(e.target.value))}
            className="w-28 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Driver carry (yds)</span>
          <input
            type="number"
            value={driverCarryYds}
            onChange={(e) => setDriverCarryYds(Number(e.target.value))}
            className="w-28 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
          />
        </label>
        {result && (
          <div className="flex flex-col justify-center">
            <span className="text-xs font-medium text-muted">Recommended course length</span>
            <span className="text-sm text-fg">~{result.recommendedYardage.toLocaleString()} yds</span>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-fg/[0.06] bg-surface p-4">
        <p className="mb-2 text-xs font-medium text-muted">
          Search a real course &mdash; pulls every tee&rsquo;s actual rating, slope, par, and yardage automatically
          (via{" "}
          <a href="https://opengolfapi.org" target="_blank" rel="noreferrer" className="underline">
            OpenGolfAPI
          </a>
          , free &amp; keyless):
        </p>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchCourses()}
            placeholder="e.g. Pebble Beach"
            className="flex-1 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
          />
          <button
            onClick={searchCourses}
            disabled={searching}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {searchError && <p className="mt-2 text-xs text-warn">{searchError}</p>}

        {searchResults.length > 0 && (
          <div className="mt-3 space-y-1">
            {searchResults.map((c) => (
              <button
                key={c.id}
                onClick={() => loadRealCourse(c)}
                disabled={loadingTees}
                className="block w-full rounded-lg border border-fg/[0.08] bg-page px-3 py-2 text-left text-sm text-fg-2 hover:border-accent/50 hover:text-fg disabled:opacity-50"
              >
                {c.name}
                {c.city && <span className="text-muted"> &middot; {c.city}, {c.state}</span>}
              </button>
            ))}
          </div>
        )}

        {activeCourseName && (
          <p className="mt-3 text-xs text-accent">
            Showing real tees for <strong>{activeCourseName}</strong>
          </p>
        )}

        {knownCourses.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-xs font-medium text-muted">
              Or load rating/slope/par from a course you&rsquo;ve already logged (add the yardage yourself, since
              logged rounds don&rsquo;t track it):
            </p>
            <div className="flex flex-wrap gap-2">
              {knownCourses.map((c) => (
                <button
                  key={c.courseName}
                  onClick={() => loadCourse(c)}
                  className="rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-xs text-fg-2 hover:border-accent/50 hover:text-fg"
                >
                  {c.courseName} ({c.courseRating}/{c.slopeRating})
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-fg/[0.06] bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-fg/[0.06] text-xs text-muted">
              <th className="px-3 py-2">Tee</th>
              <th className="px-3 py-2">Yardage</th>
              <th className="px-3 py-2">Rating</th>
              <th className="px-3 py-2">Slope</th>
              <th className="px-3 py-2">Par</th>
              <th className="px-3 py-2">Course Handicap</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tees.map((tee, i) => {
              const rec = result?.all[i]
              const isRecommended = result?.recommended.tee === tee
              return (
                <tr
                  key={i}
                  className={["border-b border-fg/[0.04]", isRecommended ? "bg-accent/10" : ""].join(" ")}
                >
                  <td className="px-3 py-1.5">
                    <input
                      value={tee.name}
                      onChange={(e) => updateTee(i, { name: e.target.value })}
                      className="w-24 rounded bg-transparent text-fg"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      value={tee.totalYardage}
                      onChange={(e) => updateTee(i, { totalYardage: Number(e.target.value) })}
                      className="w-20 rounded bg-transparent text-fg"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      step={0.1}
                      value={tee.courseRating}
                      onChange={(e) => updateTee(i, { courseRating: Number(e.target.value) })}
                      className="w-16 rounded bg-transparent text-fg"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      value={tee.slopeRating}
                      onChange={(e) => updateTee(i, { slopeRating: Number(e.target.value) })}
                      className="w-16 rounded bg-transparent text-fg"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      value={tee.par}
                      onChange={(e) => updateTee(i, { par: Number(e.target.value) })}
                      className="w-14 rounded bg-transparent text-fg"
                    />
                  </td>
                  <td className="px-3 py-1.5 font-semibold text-fg">{rec?.courseHandicap ?? "-"}</td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => removeTee(i)} className="text-xs text-muted hover:text-danger">
                      remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button
        onClick={addTee}
        className="rounded-lg border border-fg/[0.08] bg-page px-4 py-2 text-sm text-fg-2 hover:border-accent/50"
      >
        + Add tee
      </button>

      {result && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 px-5 py-4">
          <p className="text-sm font-semibold text-fg">
            Recommended: {result.recommended.tee.name} ({result.recommended.tee.totalYardage.toLocaleString()} yds)
          </p>
          <p className="mt-1 text-xs text-fg-3">
            Course Handicap at this tee: {result.recommended.courseHandicap}. Longest tee that doesn&rsquo;t exceed
            your ~{result.recommendedYardage.toLocaleString()}-yard comfortable range based on driver carry.
          </p>
        </div>
      )}
    </div>
  )
}
