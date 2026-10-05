// The outbox: things done on the phone that still have to reach Supabase (a
// finished round, an OB tag). Pure logic only, so it can be tested without a
// browser: the storage is lib/offline/outbox.ts and the senders are passed in.
//
// Rules:
//  - One job per `key`. Queuing the same key again replaces the payload but keeps
//    the job's place in line (a round saved twice is still one round).
//  - Oldest first. A temporary failure (no signal, server busy) stops the flush,
//    so later jobs never overtake it, and the job retries after a backoff.
//  - A permanent failure (rejected data, signed out) parks that job and the flush
//    carries on with the rest. Signing in releases the parked ones.

export type JobKind = "round" | "obTags"

export interface OutboxJob {
  /** Identity for dedupe: the round's own id, or "obTags:<course>:<hole>". */
  key: string
  kind: JobKind
  payload: unknown
  /** Arrival order; stays the same when the job is re-queued. */
  seq: number
  createdAt: number
  attempts: number
  nextAttemptAt: number
  lastError: string | null
  /** Parked: not retried until released (signed out, or the server rejected it). */
  blocked: boolean
}

// ---- tunables (estimates; nothing here comes from a spec or a source) ----

/** First retry after this long. An estimate: quick enough to catch a signal that just came back. */
export const BACKOFF_BASE_MS = 5_000
/** Longest wait between retries. An estimate: a phone out of signal for a few holes should still sync within minutes of regaining it. */
export const BACKOFF_MAX_MS = 5 * 60_000
/** Each wait is spread by +-this share, so many jobs do not retry in lockstep. An estimate. */
export const BACKOFF_JITTER = 0.25
/** After this many temporary failures a job is parked rather than retried forever. An estimate: about 40 minutes of trying at the cap. */
export const MAX_ATTEMPTS = 12

/** Wait before retry number `attempts` (1 = after the first failure): doubles each time, capped, jittered by rng() in [0, 1). */
export function backoffMs(attempts: number, rng: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1))
  const spread = 1 - BACKOFF_JITTER + 2 * BACKOFF_JITTER * rng()
  return Math.round(base * spread)
}

export type SendResult = { ok: true } | { ok: false; permanent: boolean; message: string }

export function nextSeq(jobs: OutboxJob[]): number {
  return jobs.reduce((m, j) => Math.max(m, j.seq), 0) + 1
}

/** Adds a job, or replaces the payload of the one with the same key (keeping its seq, and trying again straight away). */
export function enqueue(jobs: OutboxJob[], item: { key: string; kind: JobKind; payload: unknown }, now: number): OutboxJob[] {
  const existing = jobs.find((j) => j.key === item.key)
  if (existing) {
    return jobs.map((j) =>
      j.key === item.key ? { ...j, kind: item.kind, payload: item.payload, attempts: 0, nextAttemptAt: now, lastError: null, blocked: false } : j
    )
  }
  return [...jobs, { ...item, seq: nextSeq(jobs), createdAt: now, attempts: 0, nextAttemptAt: now, lastError: null, blocked: false }]
}

export const inOrder = (jobs: OutboxJob[]): OutboxJob[] => [...jobs].sort((a, b) => a.seq - b.seq)

/** Jobs that may be sent now, oldest first. */
export function dueJobs(jobs: OutboxJob[], now: number): OutboxJob[] {
  return inOrder(jobs).filter((j) => !j.blocked && j.nextAttemptAt <= now)
}

/** Records a failed send: schedules the retry, or parks the job when the failure is permanent or it has used up its attempts. */
export function recordFailure(job: OutboxJob, failure: { permanent: boolean; message: string }, now: number, rng: () => number = Math.random): OutboxJob {
  const attempts = job.attempts + 1
  const blocked = failure.permanent || attempts >= MAX_ATTEMPTS
  return { ...job, attempts, lastError: failure.message, blocked, nextAttemptAt: blocked ? job.nextAttemptAt : now + backoffMs(attempts, rng) }
}

/** Releases parked jobs (after signing in) so they are tried again at once. */
export function release(jobs: OutboxJob[], now: number): OutboxJob[] {
  return jobs.map((j) => (j.blocked ? { ...j, blocked: false, attempts: 0, nextAttemptAt: now, lastError: null } : j))
}

export interface FlushOutcome {
  jobs: OutboxJob[]
  /** Keys that were sent and removed. */
  sent: string[]
}

/**
 * Sends what is due, oldest first. A sent job is removed. A temporary failure
 * is recorded and ends the flush; a permanent one parks the job and moves on.
 * `send` must not throw (wrap it to return a SendResult).
 */
export async function flush(
  jobs: OutboxJob[],
  now: number,
  send: (job: OutboxJob) => Promise<SendResult>,
  rng: () => number = Math.random
): Promise<FlushOutcome> {
  let current = jobs
  const sent: string[] = []
  for (const job of dueJobs(jobs, now)) {
    const result = await send(job)
    if (result.ok) {
      current = current.filter((j) => j.key !== job.key)
      sent.push(job.key)
      continue
    }
    const failed = recordFailure(job, result, now, rng)
    current = current.map((j) => (j.key === job.key ? failed : j))
    if (!result.permanent && !failed.blocked) break
  }
  return { jobs: current, sent }
}

const sameJob = (a: OutboxJob, b: OutboxJob) => a.key === b.key && JSON.stringify(a.payload) === JSON.stringify(b.payload)

/**
 * Applies a flush's result to the jobs as stored NOW (they may have changed while
 * it was sending): a job sent with the payload that was sent is removed, one that
 * failed takes its new retry schedule, and a job that was added or re-queued with
 * a newer payload in the meantime is left exactly as stored.
 */
export function mergeOutcome(stored: OutboxJob[], before: OutboxJob[], outcome: FlushOutcome): OutboxJob[] {
  return stored.flatMap((s) => {
    const b = before.find((j) => j.key === s.key)
    if (!b || !sameJob(b, s)) return [s]
    if (outcome.sent.includes(s.key)) return []
    return [outcome.jobs.find((j) => j.key === s.key) ?? s]
  })
}

export type SyncState = "idle" | "pending" | "blocked"

/** What to tell the golfer: nothing waiting, waiting to sync, or stuck until they act. */
export function syncState(jobs: OutboxJob[]): SyncState {
  if (jobs.length === 0) return "idle"
  return jobs.every((j) => j.blocked) ? "blocked" : "pending"
}

/**
 * Sorts a thrown error into temporary (no signal, server hiccup) or permanent.
 * Signing out is permanent until they sign in again; so is anything the server
 * validated and refused.
 */
export function classifyError(e: unknown, online: boolean): { permanent: boolean; message: string } {
  const message = e instanceof Error ? e.message : String(e)
  if (!online || e instanceof TypeError || /failed to fetch|network|load failed|fetch failed|timeout|timed out|offline/i.test(message)) {
    return { permanent: false, message: message || "No connection" }
  }
  // Sign-in and bad-data messages from createRound (app/rounds/actions.ts) and row-level security refusals.
  if (/sign in|row-level security|violates|invalid|required|enter a|must be/i.test(message)) return { permanent: true, message }
  return { permanent: false, message }
}
