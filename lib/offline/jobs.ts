// What each kind of outbox job carries. Every job names the account it was made
// under: it is only ever sent while that account is signed in, so a round finished
// by one golfer is never saved into another's account on a shared phone.

import type { ObTag } from "@/lib/course/obTags"
import type { RoundInput } from "@/app/rounds/actions"
import type { RoundShot } from "@/lib/rounds/shots"

export const ROUND_JOB = "round" as const
export const OBTAGS_JOB = "obTags" as const
export const SHOTS_JOB = "roundShots" as const
export const PRACTICE_RUN_JOB = "practiceRun" as const

export interface RoundPayload {
  userId: string
  /** input.id is the round's own id, made when the round started. */
  input: RoundInput & { id: string }
}

export interface ObTagsPayload {
  userId: string
  courseId: string
  holeId: string
  /** The hole's complete tag set (replaces what is saved); empty clears it. */
  tags: ObTag[]
}

/** Queue key for a hole's tags: a newer set for the same hole replaces the one still waiting. */
export const obTagKey = (courseId: string, holeId: string) => `obTags:${courseId}:${holeId}`

export interface ShotsPayload {
  userId: string
  roundId: string
  /** The round's complete shot list (replaces what is saved). */
  shots: RoundShot[]
}

/** Queue key for a round's shots; queued after the round itself, so it is sent after it. */
export const shotsKey = (roundId: string) => `roundShots:${roundId}`

export interface PracticeRunPayload {
  userId: string
  /** The run as it stands; sent again, whole, after every set. */
  run: {
    id: string
    date: string
    location: string
    startedAt: string
    endedAt: string | null
    status: "running" | "completed" | "ended_early"
    notes: string | null
    /** "logged" for a drill logged by hand, "session" for one played in the runner. */
    source: "session" | "logged"
  }
  sets: {
    stepIndex: number
    blockIndex: number
    drillId: string
    label: string
    club: string | null
    skipped: boolean
    value: number | null
    attempts: number | null
    spread: { left: number; center: number; right: number } | null
    at: string
  }[]
  /** Set once the run is done: the drills whose level moved, to write to drill_levels. */
  levelChanges: { drillId: string; level: number }[]
}

export const practiceRunKey = (runId: string) => `practiceRun:${runId}`
