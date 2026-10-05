// What each kind of outbox job carries. Every job names the account it was made
// under: it is only ever sent while that account is signed in, so a round finished
// by one golfer is never saved into another's account on a shared phone.

import type { ObTag } from "@/lib/course/obTags"
import type { RoundInput } from "@/app/rounds/actions"

export const ROUND_JOB = "round" as const
export const OBTAGS_JOB = "obTags" as const

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
