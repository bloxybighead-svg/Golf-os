"use client"

// The practice session page: the set screen while sets remain, the summary after the last one (or an early end).

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActiveSession } from "@/hooks/useActiveSession"
import { useAuthUser } from "@/hooks/useAuthUser"
import { useIsCompact } from "@/hooks/useIsCompact"
import { PRACTICE_PATH } from "@/lib/practice/activeSession"
import { discardSession } from "@/lib/practice/discard"
import { endEarly, jumpToCloseout, recordEntry, skipSet, undoLast } from "@/lib/practice/runner"
import { setRoundPaused } from "@/lib/rounds/roundMode"
import { RunSummary } from "./RunSummary"
import { RunnerScreen } from "./RunnerScreen"

export function SessionRunner() {
  const router = useRouter()
  const compact = useIsCompact()
  const { session, update, finish } = useActiveSession()
  const { authUser } = useAuthUser()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  if (session === undefined) return null
  if (!session) {
    return (
      <div className="space-y-3 pt-6 text-sm">
        <p className="text-fg">No session running</p>
        <Link href={PRACTICE_PATH} className="inline-flex h-11 items-center font-semibold text-accent">
          Practice
        </Link>
      </div>
    )
  }

  if (session.status !== "running") {
    return (
      <RunSummary
        session={session}
        compact={compact}
        canSave={!!(session.userId || authUser)}
        onNotes={(notes) => update((s) => ({ ...s, notes }))}
        onDiscard={() => void discardSession(session.id, router.push)}
        onDone={async () => {
          if (await finish(Date.now(), authUser?.id ?? null)) {
            setRoundPaused(false)
            router.push(PRACTICE_PATH)
          }
        }}
      />
    )
  }

  return (
    <RunnerScreen
      session={session}
      now={now}
      compact={compact}
      onSave={(input) => update((s) => recordEntry(s, input, Date.now()))}
      onSkip={() => update((s) => skipSet(s, Date.now()))}
      onUndo={() => update((s) => undoLast(s, Date.now()))}
      onEnd={() => update(endEarly)}
      onJumpToCloseout={() => update((s) => jumpToCloseout(s, Date.now()))}
      onPause={() => {
        setRoundPaused(true)
        router.push(PRACTICE_PATH)
      }}
    />
  )
}
