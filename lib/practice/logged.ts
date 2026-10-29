// A drill logged by hand, as the same run the runner saves: one completed run, one set for the drill.

import type { PracticeRunPayload } from "@/lib/offline/jobs"
import type { LibraryDrill } from "@/lib/supabase/types"
import { localDate } from "./startSession"

const MINUTE_MS = 60_000

/** The run for `minutes` of practice ending `now`; `drill` null is free practice (a run with no sets). */
export function loggedRunPayload(args: {
  id: string
  userId: string
  drill: Pick<LibraryDrill, "id" | "name" | "locations"> | null
  minutes: number
  score: number | null
  now: Date
}): PracticeRunPayload {
  const started = new Date(args.now.getTime() - args.minutes * MINUTE_MS)
  return {
    userId: args.userId,
    run: {
      id: args.id,
      date: localDate(started),
      location: args.drill?.locations[0] ?? null,
      startedAt: started.toISOString(),
      endedAt: args.now.toISOString(),
      status: "completed",
      notes: null,
      source: "logged",
    },
    sets: args.drill
      ? [{ stepIndex: 0, blockIndex: 0, drillId: args.drill.id, label: args.drill.name, club: null, skipped: false, value: args.score, attempts: null, spread: null, at: args.now.toISOString() }]
      : [],
    levelChanges: [],
  }
}
