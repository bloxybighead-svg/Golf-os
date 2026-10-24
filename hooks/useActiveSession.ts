"use client"

// The session in progress, for the runner. Every change is saved on the device first, then queued for the
// outbox (the whole run, replacing the one still waiting). undefined until the browser has been read.

import { useCallback, useEffect, useState } from "react"
import { PRACTICE_RUN_JOB, practiceRunKey } from "@/lib/offline/jobs"
import { queueJob } from "@/lib/offline/outbox"
import { ACTIVE_SESSION_EVENT, clearActiveSession, loadActiveSession, saveActiveSession, type ActiveSession } from "@/lib/practice/activeSession"
import { toRunPayload } from "@/lib/practice/runner"

export function useActiveSession(): {
  session: ActiveSession | null | undefined
  update: (change: (s: ActiveSession) => ActiveSession) => void
  finish: (now: number) => Promise<boolean>
} {
  const [session, setSession] = useState<ActiveSession | null | undefined>(undefined)
  useEffect(() => {
    const sync = () => setSession(loadActiveSession())
    sync()
    window.addEventListener(ACTIVE_SESSION_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(ACTIVE_SESSION_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const update = useCallback((change: (s: ActiveSession) => ActiveSession) => {
    const current = loadActiveSession()
    if (!current) return
    const next = change(current)
    if (next === current) return
    saveActiveSession(next)
    void queueJob({ key: practiceRunKey(next.id), kind: PRACTICE_RUN_JOB, payload: toRunPayload(next, null) })
  }, [])

  /** Marks the run done and queues it with its level changes; the session leaves the device only once the outbox has it. */
  const finish = useCallback(async (now: number) => {
    const current = loadActiveSession()
    if (!current) return false
    const queued = await queueJob({ key: practiceRunKey(current.id), kind: PRACTICE_RUN_JOB, payload: toRunPayload(current, { at: now }) })
    if (queued) clearActiveSession()
    return queued
  }, [])

  return { session, update, finish }
}
