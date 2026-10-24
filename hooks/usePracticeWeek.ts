"use client"

// The practice week for the Practice page: weakness scores from the recent rounds, items done counted from the
// runs (saved and still in the outbox), the checklist rebuilt from both, and the plan kept for next Monday.

import { useEffect, useMemo, useState } from "react"
import { usePendingRuns } from "@/hooks/usePendingRuns"
import { useSgResults } from "@/hooks/useSgResults"
import type { ClubFit } from "@/lib/golfer/shotProfile"
import { itemsDone, mondayOf, primaryDrillScores } from "@/lib/practice/progress"
import { mergeRuns, type DrillRef, type FinishedRun } from "@/lib/practice/runs"
import { weaknessScores } from "@/lib/practice/weakness"
import { toWeaknessRounds } from "@/lib/practice/weaknessInput"
import { lastWeekSummary, planWeek, WEEK_PLAN_KEY, type LastWeekSummary, type StoredPlan, type WeekView } from "@/lib/practice/weekPlan"
import { tiger5 } from "@/lib/rounds/tiger5"
import type { SgRoundData } from "@/lib/supabase/loadSgData"

export interface PracticeWeek {
  view: WeekView
  /** True when no round or run says anything yet. */
  empty: boolean
  /** Last week's row; only on a Monday. */
  lastWeek: LastWeekSummary | null
}

function readStored(): StoredPlan | null {
  try {
    const raw = window.localStorage.getItem(WEEK_PLAN_KEY)
    const s = raw ? (JSON.parse(raw) as StoredPlan) : null
    return s && typeof s.current?.weekStart === "string" && Array.isArray(s.current.items) ? s : null
  } catch {
    return null
  }
}

/** null until the browser has been read (the server and the first client render agree). */
export function usePracticeWeek(args: { sgData: SgRoundData[]; fits: ClubFit[] | null; handicapIndex: number | null; savedRuns: FinishedRun[]; library: DrillRef[] }): PracticeWeek | null {
  const { results, ready } = useSgResults(args.sgData, args.fits, args.handicapIndex)
  const pending = usePendingRuns()
  const [browser, setBrowser] = useState<{ stored: StoredPlan | null; now: Date } | null>(null)
  useEffect(() => setBrowser({ stored: readStored(), now: new Date() }), [])

  const runs = useMemo(() => mergeRuns(args.savedRuns, pending), [args.savedRuns, pending])
  const out = useMemo(() => {
    if (!ready || !browser) return null
    const scores = weaknessScores(toWeaknessRounds(args.sgData, results), primaryDrillScores(runs, args.library))
    const view = planWeek({ stored: browser.stored, now: browser.now, scores, done: itemsDone(runs, args.library, mondayOf(browser.now)) })
    const tiger5Rounds = args.sgData.map((d) => ({ date: d.meta.date, total: tiger5({ holes: d.holes, shots: d.shots, three_putts: d.round.three_putts ?? null }).total }))
    return {
      view,
      empty: scores.every((s) => s.priority === 0) && runs.length === 0,
      lastWeek: browser.now.getDay() === 1 && view.last ? lastWeekSummary(view.last, runs, args.library, tiger5Rounds) : null,
    }
  }, [ready, browser, args.sgData, args.library, results, runs])

  useEffect(() => {
    if (!out || out.empty) return
    try {
      window.localStorage.setItem(WEEK_PLAN_KEY, JSON.stringify(out.view.next))
    } catch {
      // The plan is read again from the runs next time; only last week's row would be missing.
    }
  }, [out])
  return out
}
