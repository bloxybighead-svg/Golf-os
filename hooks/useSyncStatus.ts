"use client"

// What the sync line says: is anything waiting to reach Supabase, and did it just go through.

import { useEffect, useRef, useState } from "react"
import { OUTBOX_EVENT, readOutbox } from "@/lib/offline/outbox"
import { syncState, type SyncState } from "@/lib/offline/syncQueue"

/** "Synced" stays on screen this long after the last job goes through. An estimate. */
const SYNCED_SHOWN_MS = 6_000

export type PillState = SyncState | "synced"

export function useSyncStatus(): { state: PillState; waiting: number; online: boolean; needsSignIn: boolean } {
  const [jobs, setJobs] = useState<{ count: number; state: SyncState; needsSignIn: boolean }>({ count: 0, state: "idle", needsSignIn: false })
  const [justSynced, setJustSynced] = useState(false)
  const [online, setOnline] = useState(true)
  const hadJobs = useRef(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      const all = await readOutbox()
      setJobs({ count: all.length, state: syncState(all), needsSignIn: all.some((j) => j.blocked && /sign in/i.test(j.lastError ?? "")) })
      if (all.length > 0) {
        hadJobs.current = true
        setJustSynced(false)
      } else if (hadJobs.current) {
        hadJobs.current = false
        setJustSynced(true)
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setJustSynced(false), SYNCED_SHOWN_MS)
      }
    }
    const net = () => setOnline(navigator.onLine)
    net()
    void refresh()
    window.addEventListener(OUTBOX_EVENT, refresh)
    window.addEventListener("online", net)
    window.addEventListener("offline", net)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener(OUTBOX_EVENT, refresh)
      window.removeEventListener("online", net)
      window.removeEventListener("offline", net)
    }
  }, [])

  return { state: jobs.state === "idle" && justSynced ? "synced" : jobs.state, waiting: jobs.count, online, needsSignIn: jobs.needsSignIn }
}
