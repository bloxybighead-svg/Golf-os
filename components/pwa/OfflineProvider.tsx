"use client"

// Mounted once in the root layout: registers the service worker, shows the update
// toast, and keeps the outbox moving (sends finished rounds and OB tags to Supabase
// whenever there is signal). The rules for when and how often are lib/offline/syncQueue.ts.

import { useEffect } from "react"
import { createRound } from "@/app/rounds/actions"
import { createClient } from "@/lib/supabase/client"
import { OUTBOX_EVENT, flushOutbox, releaseParked, type Sender } from "@/lib/offline/outbox"
import { OBTAGS_JOB, ROUND_JOB, type ObTagsPayload, type RoundPayload } from "@/lib/offline/jobs"
import { cleanTags } from "@/lib/planner/obTagStore"
import { useServiceWorker } from "@/hooks/useServiceWorker"
import { UpdateToast } from "./UpdateToast"

/** Between sync attempts while the app is open: a job's own backoff decides whether it is due. An estimate. */
const FLUSH_TICK_MS = 30_000

const WRONG_ACCOUNT = "Sign in to the account this was saved from to sync it."

/** The signed-in user's id from the saved session, or null. Throws (a retry, not "signed out") when there is no connection. */
async function currentUserId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  if (!navigator.onLine) throw new TypeError("offline")
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export function OfflineProvider() {
  const { updateAvailable, applyUpdate } = useServiceWorker()

  useEffect(() => {
    const supabase = createClient()

    const senders: Record<"round" | "obTags", Sender> = {
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
    }
    const run = () => void flushOutbox(senders).catch(() => {})

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
