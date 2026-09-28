"use client"

import { useEffect, useState } from "react"
import { ChevronDown, History } from "lucide-react"
import type { SgCategory, UserDrillRun } from "@/lib/supabase/types"
import { CATEGORY_LABEL } from "@/lib/drillRecommendations"

const FILTERS: (SgCategory | "all")[] = ["all", "off_tee", "approach", "short_game", "putting"]
const SHOW = 10
const DAY_MS = 24 * 60 * 60 * 1000

export function DrillHistory({ runs }: { runs: UserDrillRun[] }) {
  const [filter, setFilter] = useState<SgCategory | "all">("all")
  const [expanded, setExpanded] = useState(false)
  // Dates are formatted in the viewer's own timezone, which the server
  // (UTC) can't know -- so they only render after mount to avoid a
  // hydration mismatch on evening entries.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const filtered = filter === "all" ? runs : runs.filter((r) => r.drill_library?.category === filter)
  const completed30d = mounted
    ? filtered.filter((r) => r.completed_at && Date.now() - new Date(r.completed_at).getTime() <= 30 * DAY_MS).length
    : null

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4 shadow-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left md:pointer-events-none"
      >
        <span className="flex items-center gap-2">
          <History size={15} className="text-accent" />
          <span className="label-xs">Drill History</span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {runs.length === 0 ? "none yet" : `${runs.length} logged`}
          <ChevronDown size={13} className={["transition-transform md:hidden", expanded ? "rotate-180" : ""].join(" ")} />
        </span>
      </button>

      <div className={[expanded ? "block" : "hidden", "md:block"].join(" ")}>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-faint">Start a recommended drill above and it will show up here.</p>
        ) : (
          <>
            <div className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={[
                    "shrink-0 rounded-lg border px-3 py-1 text-xs transition-colors",
                    filter === f
                      ? "border-accent bg-accent font-semibold text-on-accent"
                      : "border-fg/[0.06] bg-surface-2 text-muted hover:text-fg",
                  ].join(" ")}
                >
                  {f === "all" ? "All" : CATEGORY_LABEL[f]}
                </button>
              ))}
            </div>

            <p className="mt-3 min-h-[1rem] text-xs text-muted">
              {completed30d != null && `${completed30d} completed in the last 30 days`}
            </p>

            {filtered.length === 0 ? (
              <p className="mt-2 text-sm text-faint">No drills in this category yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-fg/[0.04]">
                {filtered.slice(0, SHOW).map((r) => (
                  <li key={r.id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-fg">
                        {r.drill_library?.name ?? "Drill"}
                      </p>
                      <span className="shrink-0 text-xs text-muted">
                        {mounted &&
                          new Date(r.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      {r.drill_library && <span className="text-faint">{CATEGORY_LABEL[r.drill_library.category]}</span>}
                      {r.completed_at ? (
                        <span className="text-accent">Completed</span>
                      ) : (
                        <span className="text-warn">Not finished</span>
                      )}
                      {r.reps_completed != null && <span className="text-fg-3">{r.reps_completed} reps</span>}
                    </div>
                    {r.notes && <p className="mt-1 text-xs italic text-muted">{r.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
