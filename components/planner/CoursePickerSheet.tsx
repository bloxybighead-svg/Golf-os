"use client"

// The sheet behind the Play title line: course search, recent courses, hole
// grid, whose shots and bag, course data (moved verbatim from CourseMapClient.tsx).

import Link from "next/link"
import { createPortal } from "react-dom"
import { RefreshCw, X } from "lucide-react"
import type { CourseGeometry, CourseHole } from "@/lib/course/overpass"
import type { Tendency } from "@/lib/golfer/build"
import type { Club } from "@/lib/golfer/tables"
import { CLUB_CATALOG } from "@/lib/golfer/bag"
import { shortCourseName } from "@/lib/planner/labels"
import type { CourseHit } from "@/lib/planner/storage"
import { TendencyPicker } from "@/components/simulator/TendencyPicker"
import type { CalibratedClub, ShotSource } from "@/lib/planner/types"

export interface CourseStats {
  greens: number
  fairways: number
  bunkers: number
  water: number
  trees: number
  range: number
}

export interface CoursePickerSheetProps {
  onClose: () => void
  query: string
  onQueryChange: (q: string) => void
  searching: boolean
  searched: boolean
  /** Why the last search failed (e.g. too many searches), shown instead of "No courses found". */
  searchError: string
  hits: CourseHit[]
  onChooseCourse: (c: CourseHit) => void
  course: CourseHit | null
  holes: CourseHole[]
  holeId: string | null
  onPickHole: (h: CourseHole) => void
  recent: CourseHit[]
  calibrated: CalibratedClub[] | null
  calibratedName: string
  /** Sessions behind the golfer's own profile; null when they have none. */
  mySessions: number | null
  source: ShotSource
  onSourceChange: (s: ShotSource) => void
  handicap: number
  onHandicapChange: (h: number) => void
  driverCarry: string
  onDriverCarryChange: (v: string) => void
  sevenIronCarry: string
  onSevenIronCarryChange: (v: string) => void
  tendency: Tendency
  onTendencyChange: (t: Tendency) => void
  extraCarries: Partial<Record<Club, number>>
  bag: Club[]
  onToggleClub: (c: Club) => void
  estimateNotes: Record<string, string>
  geometry: CourseGeometry | null
  stats: CourseStats
  hasCourseProblems: boolean
  refreshing: boolean
  onRefresh: () => void
}

export function CoursePickerSheet({
  onClose,
  query,
  onQueryChange,
  searching,
  searched,
  searchError,
  hits,
  onChooseCourse,
  course,
  holes,
  holeId,
  onPickHole,
  recent,
  calibrated,
  calibratedName,
  mySessions,
  source,
  onSourceChange,
  handicap,
  onHandicapChange,
  driverCarry,
  onDriverCarryChange,
  sevenIronCarry,
  onSevenIronCarryChange,
  tendency,
  onTendencyChange,
  extraCarries,
  bag,
  onToggleClub,
  estimateNotes,
  geometry,
  stats,
  hasCourseProblems,
  refreshing,
  onRefresh,
}: CoursePickerSheetProps) {
  return createPortal(
      <div
        className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 md:items-start md:p-4 md:pt-24"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Course and hole"
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[85svh] w-full flex-col overflow-hidden rounded-t-2xl border border-fg/[0.08] bg-page pb-[env(safe-area-inset-bottom)] md:max-w-xl md:rounded-2xl md:pb-0"
        >
          <div className="flex items-center gap-2 border-b border-fg/[0.08] p-3">
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Find a course"
              aria-label="Find a course"
              className="h-11 min-w-0 flex-1 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
            />
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-fg/[0.06] hover:text-fg"
            >
              <X size={18} />
            </button>
          </div>

          <div className="overflow-y-auto">
            {query.trim().length >= 3 ? (
              <ul className="divide-y divide-fg/[0.06]">
                {searching && hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">Searching…</li>}
                {!searching && searched && hits.length === 0 && (
                  <li className="px-4 py-3 text-sm text-muted">{searchError || "No courses found."}</li>
                )}
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => onChooseCourse(h)}
                      className="flex min-h-[44px] w-full items-baseline gap-2 px-4 py-2.5 text-left hover:bg-fg/[0.04]"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{h.name}</span>
                      <span className="shrink-0 text-xs text-muted">{[h.city, h.state].filter(Boolean).join(", ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {holes.length > 0 && course && (
                  <section className="p-4">
                    <p className="label-xs">{shortCourseName(course.name)}</p>
                    <div className="mt-2 grid grid-cols-6 gap-1.5">
                      {holes.map((h, i) => (
                        <button
                          key={h.id}
                          onClick={() => {
                            onPickHole(h)
                            onClose()
                          }}
                          aria-pressed={h.id === holeId}
                          className={`flex h-12 flex-col items-center justify-center rounded-lg tabular-nums transition-colors ${
                            h.id === holeId ? "bg-accent text-on-accent" : "bg-surface text-fg hover:bg-fg/[0.06]"
                          }`}
                        >
                          <span className="text-sm font-semibold leading-tight">{h.ref ?? i + 1}</span>
                          {h.par != null && <span className="text-[10px] leading-tight opacity-70">Par {h.par}</span>}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {recent.filter((r) => r.id !== course?.id).length > 0 && (
                  <section className="border-t border-fg/[0.06] py-2">
                    <p className="label-xs px-4 pt-2">Recent</p>
                    <ul className="mt-1 divide-y divide-fg/[0.06]">
                      {recent
                        .filter((r) => r.id !== course?.id)
                        .map((r) => (
                          <li key={r.id}>
                            <button
                              onClick={() => onChooseCourse(r)}
                              className="flex min-h-[44px] w-full items-center px-4 py-2.5 text-left text-sm text-fg hover:bg-fg/[0.04]"
                            >
                              {r.name}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </section>
                )}

                <section className="space-y-3 border-t border-fg/[0.06] p-4">
                  <p className="label-xs">Shots</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted">Shots from</span>
                      <select
                        value={source}
                        onChange={(e) => onSourceChange(e.target.value as ShotSource)}
                        className="h-11 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg md:h-9"
                      >
                        {mySessions != null && (
                          <option value="mine">
                            My shots ({mySessions} session{mySessions === 1 ? "" : "s"})
                          </option>
                        )}
                        {calibrated && <option value="calibrated">{calibratedName} (old data)</option>}
                        <option value="handicap">Handicap estimate</option>
                      </select>
                    </label>
                    {source === "handicap" && (
                      <>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-muted">Handicap</span>
                          <input
                            type="number"
                            min={0}
                            max={36}
                            step={1}
                            inputMode="decimal"
                            value={handicap}
                            onChange={(e) => {
                              onHandicapChange(Math.min(36, Math.max(0, Number(e.target.value) || 0)))
                            }}
                            className="h-11 w-20 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg md:h-9"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-muted">Driver carry</span>
                          <input
                            type="number"
                            placeholder="avg"
                            inputMode="numeric"
                            value={driverCarry}
                            onChange={(e) => {
                              onDriverCarryChange(e.target.value)
                            }}
                            className="h-11 w-24 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint md:h-9"
                          />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-muted">7-iron carry</span>
                          <input
                            type="number"
                            placeholder="avg"
                            inputMode="numeric"
                            value={sevenIronCarry}
                            onChange={(e) => {
                              onSevenIronCarryChange(e.target.value)
                            }}
                            className="h-11 w-24 rounded-lg border border-fg/[0.08] bg-surface px-3 text-sm text-fg placeholder:text-faint md:h-9"
                          />
                        </label>
                        <TendencyPicker
                          value={tendency}
                          onChange={(t) => {
                            onTendencyChange(t)
                          }}
                        />
                      </>
                    )}
                  </div>
                  {source === "handicap" && (
                    <p className="text-xs text-muted">
                      {Object.keys(extraCarries).length > 0 &&
                        `Plus ${Object.keys(extraCarries).length} more carr${Object.keys(extraCarries).length === 1 ? "y" : "ies"} from setup. `}
                      <Link href="/welcome" className="font-semibold text-accent hover:underline">
                        Edit setup
                      </Link>
                    </p>
                  )}
                  <div>
                    <p className="text-xs text-muted">
                      Bag · <span className="tabular-nums">{bag.length}</span> clubs
                    </p>
                    <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                      {CLUB_CATALOG.map((c) => {
                        const on = bag.includes(c)
                        return (
                          <button
                            key={c}
                            onClick={() => onToggleClub(c)}
                            aria-pressed={on}
                            className={`h-11 rounded-lg text-xs font-medium transition-colors md:h-9 ${
                              on ? "bg-accent text-on-accent" : "bg-surface text-fg-3 hover:text-fg"
                            }`}
                          >
                            {c}
                          </button>
                        )
                      })}
                    </div>
                    {Object.keys(estimateNotes).length > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        {Object.values(estimateNotes).join(". ")}.
                      </p>
                    )}
                  </div>
                </section>

                {course && geometry && (
                  <section className="space-y-2 border-t border-fg/[0.06] p-4 text-xs text-fg-3">
                    <p className="label-xs">Course data</p>
                    <p className="tabular-nums">
                      {holes.length} holes · {stats.greens} greens · {stats.fairways} fairways · {stats.bunkers} bunkers ·{" "}
                      {stats.water} water · {stats.trees} tree areas
                    </p>
                    {hasCourseProblems && (
                      <div className="space-y-1">
                        {geometry.scope === "radius" && <p>No course boundary is mapped, so neighbouring courses may appear.</p>}
                        {holes.length === 0 && <p>No hole lines are mapped. Place the ball and pin by hand.</p>}
                        {holes.length > 0 && stats.greens === 0 && (
                          <p>Greens and hazards aren&rsquo;t traced, so the club ranking is only a distance guide.</p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={onRefresh}
                      disabled={refreshing}
                      className="flex h-11 items-center gap-1.5 rounded-lg border border-fg/[0.08] px-3 text-fg-2 hover:text-fg disabled:opacity-50 md:h-9"
                    >
                      <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
                      {refreshing ? "Refreshing…" : "Refresh course data"}
                    </button>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>,
      document.body
  )
}
