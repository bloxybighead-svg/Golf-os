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
  finish: (now: number, userId: string | null) => Promise<boolean>
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
    // A session started signed out stays on the device until it can be saved to an account.
    if (next.userId) void queueJob({ key: practiceRunKey(next.id), kind: PRACTICE_RUN_JOB, payload: toRunPayload(next, null) })
  }, [])

  /** Marks the run done and queues it with its level changes (to `userId` when it was started signed out); the session leaves the device only once the outbox has it. */
  const finish = useCallback(async (now: number, userId: string | null) => {
    const current = loadActiveSession()
    const owner = current?.userId || userId
    if (!current || !owner) return false
    const queued = await queueJob({ key: practiceRunKey(current.id), kind: PRACTICE_RUN_JOB, payload: toRunPayload({ ...current, userId: owner }, { at: now }) })
    if (queued) clearActiveSession()
    return queued
  }, [])

  return { session, update, finish }
}
