// Throwing away a session that has no scores: it leaves the device and the outbox, and the golfer goes back to Practice.

import { practiceRunKey } from "@/lib/offline/jobs"
import { dropJob } from "@/lib/offline/outbox"
import { setRoundPaused } from "@/lib/rounds/roundMode"
import { clearActiveSession, PRACTICE_PATH } from "./activeSession"

export async function discardSession(runId: string, go: (path: string) => void): Promise<void> {
  clearActiveSession()
  setRoundPaused(false)
  go(PRACTICE_PATH)
  await dropJob(practiceRunKey(runId))
}
