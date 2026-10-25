"use client"

// Mounted once in the root layout: registers the service worker, shows the update
// toast, and keeps the outbox moving (sends finished rounds, their shots and OB tags to Supabase
// whenever there is signal). The rules for when and how often are lib/offline/syncQueue.ts.

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createRound } from "@/app/rounds/actions"
import { createClient } from "@/lib/supabase/client"
import { runStartupCleanup } from "@/lib/offline/cleanup"
import { OUTBOX_EVENT, flushOutbox, releaseParked, type Sender } from "@/lib/offline/outbox"
import type { OutboxJob } from "@/lib/offline/syncQueue"
import { OBTAGS_JOB, PRACTICE_RUN_JOB, ROUND_JOB, SHOTS_JOB, type ObTagsPayload, type PracticeRunPayload, type RoundPayload, type ShotsPayload } from "@/lib/offline/jobs"
import { toDbRow } from "@/lib/rounds/shots"
import { cleanTags } from "@/lib/planner/obTagStore"
import { useServiceWorker } from "@/hooks/useServiceWorker"
import { UpdateToast } from "./UpdateToast"

/** Between sync attempts while the app is open: a job's own backoff decides whether it is due. An estimate. */
const FLUSH_TICK_MS = 30_000

const WRONG_ACCOUNT = "Sign in to the account this was saved from to sync it."

/** The signed-in user's id from the saved session, or null. Throws (a retry, not "signed out") when there is no connection. */
async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  if (!navigator.onLine) throw new TypeError("offline")
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export function OfflineProvider() {
  const { updateAvailable, applyUpdate } = useServiceWorker()
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    const supabase = createClient()
    void runStartupCleanup() // old golfos.course.* copies filled localStorage; IndexedDB is the only course cache now

    const senders: Record<OutboxJob["kind"], Sender> = {
      [ROUND_JOB]: async (job) => {
        const { userId, input } = job.payload as RoundPayload
        if ((await currentUserId(supabase)) !== userId) throw new Error(WRONG_ACCOUNT)
        await createRound(input) // an upsert on input.id: sending it twice is still one round
      },
      [OBTAGS_JOB]: async (job) => {
        const p = job.payload as ObTagsPayload
        if ((await currentUserId(supabase)) !== p.userId) throw new Error(WRONG_ACCOUNT)
        const del = await supabase.from("hole_ob_tags").delete().eq("course_id", p.courseId).eq("hole_id", p.holeId)
        if (del.error) throw new Error(del.error.message)
        const tags = cleanTags(p.tags)
        if (tags.length > 0) {
          const ins = await supabase
            .from("hole_ob_tags")
            .insert(tags.map((t) => ({ user_id: p.userId, course_id: p.courseId, hole_id: p.holeId, side: t.side, margin_yds: t.marginYds })))
          if (ins.error) throw new Error(ins.error.message)
        }
      },
      [SHOTS_JOB]: async (job) => {
        const p = job.payload as ShotsPayload
        if ((await currentUserId(supabase)) !== p.userId) throw new Error(WRONG_ACCOUNT)
        const del = await supabase.from("round_shots").delete().eq("round_id", p.roundId)
        if (del.error) throw new Error(del.error.message)
        if (p.shots.length > 0) {
          const ins = await supabase.from("round_shots").insert(p.shots.map((s) => toDbRow(p.roundId, p.userId, s)))
          if (ins.error) throw new Error(ins.error.message)
        }
      },
      [PRACTICE_RUN_JOB]: async (job) => {
        const p = job.payload as PracticeRunPayload
        if ((await currentUserId(supabase)) !== p.userId) throw new Error(WRONG_ACCOUNT)
        const run = await supabase.from("practice_runs").upsert({
          id: p.run.id,
          user_id: p.userId,
          run_date: p.run.date,
          location: p.run.location,
          started_at: p.run.startedAt,
          ended_at: p.run.endedAt,
          status: p.run.status,
          notes: p.run.notes,
          source: p.run.source,
        })
        if (run.error) throw new Error(run.error.message)
        const del = await supabase.from("practice_run_sets").delete().eq("run_id", p.run.id)
        if (del.error) throw new Error(del.error.message)
        if (p.sets.length > 0) {
          const ins = await supabase.from("practice_run_sets").insert(
            p.sets.map((s) => ({
              run_id: p.run.id,
              user_id: p.userId,
              step_index: s.stepIndex,
              block_index: s.blockIndex,
              drill_id: s.drillId,
              label: s.label,
              club: s.club,
              skipped: s.skipped,
              value: s.value,
              attempts: s.attempts,
              spread: s.spread,
              saved_at: s.at,
            }))
          )
          if (ins.error) throw new Error(ins.error.message)
        }
        if (p.levelChanges.length > 0) {
          const levels = await supabase
            .from("drill_levels")
            .upsert(p.levelChanges.map((c) => ({ user_id: p.userId, drill_id: c.drillId, level: c.level, updated_at: new Date().toISOString() })), { onConflict: "user_id,drill_id" })
          if (levels.error) throw new Error(levels.error.message)
        }
      },
    }
    const run = () =>
      void flushOutbox(senders)
        .then((sent) => {
          // Practice history is read from the database, so a run that just landed there needs a fresh read.
          if (window.location.pathname === "/you/practice" && sent.some((k) => k.startsWith("practiceRun:"))) routerRef.current.refresh()
        })
        .catch(() => {})

    run()
    const timer = setInterval(run, FLUSH_TICK_MS)
    const onVisible = () => document.visibilityState === "visible" && run()
    window.addEventListener("online", run)
    window.addEventListener(OUTBOX_EVENT, run)
    document.addEventListener("visibilitychange", onVisible)
    // Signing in again releases anything parked for being signed out.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) void releaseParked().then(run)
    })
    return () => {
      clearInterval(timer)
      window.removeEventListener("online", run)
      window.removeEventListener(OUTBOX_EVENT, run)
      document.removeEventListener("visibilitychange", onVisible)
      subscription.unsubscribe()
    }
  }, [])

  return <UpdateToast available={updateAvailable} onUpdate={applyUpdate} />
}
