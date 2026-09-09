"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { recommendTee, type TeeOption } from "@/lib/tbox/estimate"

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

export function TBoxClient({ knownCourses, defaultDriverCarryYds }: Props) {
  const [handicapIndex, setHandicapIndex] = useState(10)
  const [driverCarryYds, setDriverCarryYds] = useState(defaultDriverCarryYds ?? 230)
  const [tees, setTees] = useState<TeeOption[]>(DEFAULT_TEES)

  const result = useMemo(() => {
    try {
      return recommendTee({ handicapIndex, driverCarryYds }, tees)
    } catch {
      return null
    }
  }, [handicapIndex, driverCarryYds, tees])

  function updateTee(i: number, patch: Partial<TeeOption>) {
    setTees((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))
  }

  function addTee() {
    setTees((prev) => [...prev, { name: `Tee ${prev.length + 1}`, totalYardage: 6000, courseRating: 70, slopeRating: 125, par: 72 }])
  }

  function removeTee(i: number) {
    setTees((prev) => prev.filter((_, idx) => idx !== i))
  }

  function loadCourse(course: KnownCourse) {
    setTees((prev) => [
      ...prev,
      { name: course.courseName, totalYardage: 6000, courseRating: course.courseRating, slopeRating: course.slopeRating, par: course.par },
    ])
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Tee Box Estimator</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            Which tees fit your handicap and driver distance, using the USGA Course Handicap formula plus an
            approximate distance guideline.
          </p>
        </div>
        <Link href="/simulator" className="text-xs text-[#22c55e] hover:underline">
          &larr; Dispersion Simulator
        </Link>
      </div>

      <div className="flex flex-wrap gap-6 rounded-xl border border-white/[0.06] bg-[#111111] p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[#6b7280]">Handicap Index</span>
          <input
            type="number"
            step={0.1}
            value={handicapIndex}
            onChange={(e) => setHandicapIndex(Number(e.target.value))}
            className="w-28 rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[#6b7280]">Driver carry (yds)</span>
          <input
            type="number"
            value={driverCarryYds}
            onChange={(e) => setDriverCarryYds(Number(e.target.value))}
            className="w-28 rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
          />
        </label>
        {result && (
          <div className="flex flex-col justify-center">
            <span className="text-xs font-medium text-[#6b7280]">Recommended course length</span>
            <span className="text-sm text-white">~{result.recommendedYardage.toLocaleString()} yds</span>
          </div>
        )}
      </div>

      {knownCourses.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-[#111111] p-4">
          <p className="mb-2 text-xs font-medium text-[#6b7280]">
            Load rating/slope/par from a course you&rsquo;ve already logged (yardage still needs to be entered):
          </p>
          <div className="flex flex-wrap gap-2">
            {knownCourses.map((c) => (
              <button
                key={c.courseName}
                onClick={() => loadCourse(c)}
                className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-xs text-[#d1d5db] hover:border-[#22c55e]/50 hover:text-white"
              >
                {c.courseName} ({c.courseRating}/{c.slopeRating})
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#111111]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-xs text-[#6b7280]">
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
                  className={["border-b border-white/[0.04]", isRecommended ? "bg-[#22c55e]/10" : ""].join(" ")}
                >
                  <td className="px-3 py-1.5">
                    <input
                      value={tee.name}
                      onChange={(e) => updateTee(i, { name: e.target.value })}
                      className="w-24 rounded bg-transparent text-white"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      value={tee.totalYardage}
                      onChange={(e) => updateTee(i, { totalYardage: Number(e.target.value) })}
                      className="w-20 rounded bg-transparent text-white"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      step={0.1}
                      value={tee.courseRating}
                      onChange={(e) => updateTee(i, { courseRating: Number(e.target.value) })}
                      className="w-16 rounded bg-transparent text-white"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      value={tee.slopeRating}
                      onChange={(e) => updateTee(i, { slopeRating: Number(e.target.value) })}
                      className="w-16 rounded bg-transparent text-white"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      value={tee.par}
                      onChange={(e) => updateTee(i, { par: Number(e.target.value) })}
                      className="w-14 rounded bg-transparent text-white"
                    />
                  </td>
                  <td className="px-3 py-1.5 font-semibold text-white">{rec?.courseHandicap ?? "-"}</td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => removeTee(i)} className="text-xs text-[#6b7280] hover:text-red-400">
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
        className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-4 py-2 text-sm text-[#d1d5db] hover:border-[#22c55e]/50"
      >
        + Add tee
      </button>

      {result && (
        <div className="rounded-xl border border-[#22c55e]/40 bg-[#22c55e]/10 px-5 py-4">
          <p className="text-sm font-semibold text-white">
            Recommended: {result.recommended.tee.name} ({result.recommended.tee.totalYardage.toLocaleString()} yds)
          </p>
          <p className="mt-1 text-xs text-[#9ca3af]">
            Course Handicap at this tee: {result.recommended.courseHandicap}. Longest tee that doesn&rsquo;t exceed
            your ~{result.recommendedYardage.toLocaleString()}-yard comfortable range based on driver carry.
          </p>
        </div>
      )}
    </div>
  )
}
