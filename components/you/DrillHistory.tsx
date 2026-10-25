"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronDown, History } from "lucide-react"
import type { LibraryDrill, SgCategory } from "@/lib/supabase/types"
import { CATEGORY_LABEL } from "@/lib/drillRecommendations"
import { usePendingRuns } from "@/hooks/usePendingRuns"
import { historyRows } from "@/lib/practice/history"
import { mergeRuns, type DrillRef, type FinishedRun } from "@/lib/practice/runs"

const FILTERS: (SgCategory | "all")[] = ["all", "off_tee", "approach", "short_game", "putting"]
const SHOW = 10

export function DrillHistory({ runs, library }: { runs: FinishedRun[]; library: (DrillRef & Pick<LibraryDrill, "category">)[] }) {
  const pending = usePendingRuns()
  const rows = useMemo(() => historyRows(mergeRuns(runs, pending), library), [runs, pending, library])
  const [filter, setFilter] = useState<SgCategory | "all">("all")
  const [expanded, setExpanded] = useState(false)
  // Dates are formatted in the viewer's own timezone, which the server
  // (UTC) can't know -- so they only render after mount to avoid a
  // hydration mismatch on evening entries.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const filtered = filter === "all" ? rows : rows.filter((r) => r.category === filter)

  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left md:pointer-events-none"
      >
        <span className="flex items-center gap-2">
          <History size={15} className="text-accent" />
          <span className="label-xs">Drill History</span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {rows.length === 0 ? "none yet" : `${rows.length} logged`}
          <ChevronDown size={13} className={["transition-transform md:hidden", expanded ? "rotate-180" : ""].join(" ")} />
        </span>
      </button>

      <div className={[expanded ? "block" : "hidden", "md:block"].join(" ")}>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-fg-3">Nothing logged yet</p>
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

            {filtered.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No drills in this category yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-fg/[0.04]">
                {filtered.slice(0, SHOW).map((r) => (
                  <li key={r.key} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-semibold text-fg">{r.name}</p>
                      <span className="shrink-0 text-xs text-muted">
                        {mounted && new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      {r.category && <span className="text-muted">{CATEGORY_LABEL[r.category]}</span>}
                      <span className="text-fg-3 tabular-nums">{r.score ?? "logged"}</span>
                      {r.session && <span className="text-accent">Session</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Link href="/you/practice/older" className="mt-3 flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline md:min-h-0">
        Older sessions
      </Link>
    </div>
  )
}
