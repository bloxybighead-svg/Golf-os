"use client"

// Practice runs finished on this device that the outbox has not sent yet, so the week reads them straight away.

import { useEffect, useState } from "react"
import type { PracticeRunPayload } from "@/lib/offline/jobs"
import { OUTBOX_EVENT, readOutbox } from "@/lib/offline/outbox"
import { runFromPayload, type FinishedRun } from "@/lib/practice/runs"

export function usePendingRuns(): FinishedRun[] {
  const [runs, setRuns] = useState<FinishedRun[]>([])
  useEffect(() => {
    let live = true
    const read = async () => {
      const jobs = await readOutbox()
      if (live) setRuns(jobs.flatMap((j) => (j.kind === "practiceRun" ? [runFromPayload(j.payload as PracticeRunPayload)] : [])).filter((r): r is FinishedRun => r != null))
    }
    void read()
    window.addEventListener(OUTBOX_EVENT, read)
    return () => {
      live = false
      window.removeEventListener(OUTBOX_EVENT, read)
    }
  }, [])
  return runs
}
