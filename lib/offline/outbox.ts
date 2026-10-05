// The browser side of the outbox: queue a job, read what is waiting, and run a
// flush with the senders the app provides. The rules are in syncQueue.ts.

import { outboxRead, outboxUpdate } from "./db"
import { classifyError, enqueue, flush, mergeOutcome, release, type OutboxJob, type SendResult } from "./syncQueue"

export const OUTBOX_EVENT = "golfos:outbox"

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OUTBOX_EVENT))
}

/** Queues a job (replacing one with the same key). false when IndexedDB could not keep it. */
export async function queueJob(item: { key: string; kind: OutboxJob["kind"]; payload: unknown }): Promise<boolean> {
  const jobs = await outboxUpdate((cur) => enqueue(cur, item, Date.now()))
  announce()
  return jobs !== null
}

export const readOutbox = outboxRead

/** After signing in: parked jobs get tried again. */
export async function releaseParked(): Promise<void> {
  await outboxUpdate((cur) => release(cur, Date.now()))
  announce()
}

export type Sender = (job: OutboxJob) => Promise<void>

let flushing: Promise<string[]> | null = null

/**
 * Sends what is due. One flush at a time per tab; `senders` throw on failure and
 * the error is sorted into temporary or permanent. Returns the keys that went through.
 */
export function flushOutbox(senders: Record<OutboxJob["kind"], Sender>): Promise<string[]> {
  if (flushing) return flushing
  flushing = (async () => {
    const before = await outboxRead()
    const send = async (job: OutboxJob): Promise<SendResult> => {
      try {
        await senders[job.kind](job)
        return { ok: true }
      } catch (e) {
        const online = typeof navigator === "undefined" ? true : navigator.onLine
        return { ok: false, ...classifyError(e, online) }
      }
    }
    const outcome = await flush(before, Date.now(), send)
    await outboxUpdate((stored) => mergeOutcome(stored, before, outcome))
    announce()
    return outcome.sent
  })().finally(() => {
    flushing = null
  })
  return flushing
}
