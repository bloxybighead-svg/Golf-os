"use client"

import { fetchWithSnapshot, snapshotKeys } from "@/lib/offline/snapshots"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react"
import { courseHandicap, recommendTee, type TeeOption } from "@/lib/tbox/estimate"
import { neighbourTees, teeChoiceKey as choiceKey, teeOptionsFrom, type OpenGolfApiTee } from "@/lib/tbox/tees"

interface Props {
  courseId: string
  courseName: string
  /** The bag's driver carry, which sets the recommended course length. */
  driverCarryYds: number | null
  /** Only used to show each tee's course handicap; the pick itself is by length. */
  handicapIndex: number | null
  /** Phone dock: one short row (the tee, plus shorter/longer steppers) instead of text buttons. */
  compact?: boolean
}

// One line under the title: the recommended tee the moment a course loads, the
// next longer and shorter tees one tap away, and the full list behind a tap.
export function TeeLine({ courseId, courseName, driverCarryYds, handicapIndex, compact = false }: Props) {
  const [tees, setTees] = useState<TeeOption[] | null>(null) // null = loading
  const [chosen, setChosen] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setTees(null)
    try {
      setChosen(localStorage.getItem(choiceKey(courseId)))
    } catch {
      setChosen(null)
    }
    // The tees saved at Start round answer when there is no signal.
    fetchWithSnapshot<{ tees?: OpenGolfApiTee[] }>(`/api/courses/${courseId}/tees`, snapshotKeys.tees(courseId))
      .then((d) => !cancelled && setTees(teeOptionsFrom((d?.tees ?? []) as OpenGolfApiTee[])))
      .catch(() => !cancelled && setTees([]))
    return () => {
      cancelled = true
    }
  }, [courseId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const result = useMemo(() => {
    if (!tees || tees.length === 0 || driverCarryYds == null) return null
    return recommendTee({ handicapIndex: handicapIndex ?? 0, driverCarryYds }, tees)
  }, [tees, driverCarryYds, handicapIndex])

  function choose(name: string) {
    setChosen(name)
    setOpen(false)
    try {
      localStorage.setItem(choiceKey(courseId), name)
    } catch {
      // Storage blocked: the choice still holds for this visit.
    }
  }

  if (tees === null) return null
  if (!result) {
    return (
      <p className="truncate text-sm text-fg-3">
        {compact ? "No tee data." : "No tee data for this course."}{" "}
        <Link href="/you/lab?view=tbox" className="font-semibold text-accent hover:underline">
          Enter tees
        </Link>
      </p>
    )
  }

  const best = result.recommended.tee
  const selected = tees.find((t) => t.name === chosen) ?? best
  const isBest = selected.name === best.name
  const { longer, shorter } = neighbourTees(tees, selected.name)
  const ch = (t: TeeOption) => (handicapIndex != null ? courseHandicap(handicapIndex, t.slopeRating, t.courseRating, t.par) : null)

  const neighbour = (t: TeeOption, dir: "Longer" | "Shorter") => (
    <button
      key={dir}
      onClick={() => choose(t.name)}
      className="h-11 rounded-lg border border-fg/[0.08] px-3 text-xs text-fg-3 transition-colors hover:border-fg/20 hover:text-fg md:h-8"
    >
      {dir}: <span className="font-semibold text-fg-2">{t.name}</span>
    </button>
  )

  return (
    <>
      <div className={compact ? "flex min-w-0 items-center gap-1" : "flex flex-wrap items-center gap-x-2 gap-y-1"}>
        <button
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-[44px] min-w-0 items-center gap-1.5 text-sm md:min-h-[32px]"
        >
          <span className="shrink-0 text-fg-3">{isBest ? "Play" : "Playing"}</span>
          <span className="min-w-0 truncate font-semibold text-fg">{selected.name}</span>
          <span className="shrink-0 text-muted tabular-nums">· {selected.totalYardage.toLocaleString()}</span>
          <ChevronDown size={15} className="shrink-0 text-muted" />
        </button>
        {compact ? (
          <>
            {shorter && (
              <button onClick={() => choose(shorter.name)} aria-label={`Shorter tee: ${shorter.name}`} title={`Shorter: ${shorter.name}`} className="flex h-11 w-9 shrink-0 items-center justify-center text-fg-3">
                <ChevronLeft size={18} />
              </button>
            )}
            {longer && (
              <button onClick={() => choose(longer.name)} aria-label={`Longer tee: ${longer.name}`} title={`Longer: ${longer.name}`} className="flex h-11 w-9 shrink-0 items-center justify-center text-fg-3">
                <ChevronRight size={18} />
              </button>
            )}
          </>
        ) : (
          <>
            {longer && neighbour(longer, "Longer")}
            {shorter && neighbour(shorter, "Shorter")}
          </>
        )}
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 md:items-start md:p-4 md:pt-24"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Tees at ${courseName}`}
              onClick={(e) => e.stopPropagation()}
              className="w-full overflow-hidden rounded-t-2xl border border-fg/[0.08] bg-page pb-[env(safe-area-inset-bottom)] md:max-w-md md:rounded-2xl md:pb-0"
            >
              <div className="flex items-center justify-between border-b border-fg/[0.08] py-2 pl-4 pr-2">
                <p className="label-xs">Tees</p>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-3 hover:bg-fg/[0.06] hover:text-fg"
                >
                  <X size={18} />
                </button>
              </div>
              <ul className="divide-y divide-fg/[0.06]">
                {tees.map((t) => {
                  const c = ch(t)
                  return (
                    <li key={t.name}>
                      <button
                        onClick={() => choose(t.name)}
                        aria-pressed={t.name === selected.name}
                        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-fg/[0.04]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-fg">
                            {t.name}
                            {t.name === best.name && <span className="ml-2 text-xs font-normal text-accent">Best fit</span>}
                          </span>
                          <span className="block text-xs text-muted tabular-nums">
                            {t.totalYardage.toLocaleString()} yd · {t.courseRating}/{t.slopeRating}
                            {c != null && ` · course handicap ${c}`}
                          </span>
                        </span>
                        {t.name === selected.name && <Check size={16} className="shrink-0 text-accent" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="border-t border-fg/[0.06] px-4 py-3 text-xs text-muted tabular-nums">
                Best fit: the longest tee under {result.recommendedYardage.toLocaleString()} yd, from your{" "}
                {Math.round(driverCarryYds!)}-yd driver.
              </p>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
