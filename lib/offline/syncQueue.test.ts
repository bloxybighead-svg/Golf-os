import { describe, expect, it } from "vitest"
import {
  BACKOFF_BASE_MS,
  BACKOFF_JITTER,
  BACKOFF_MAX_MS,
  MAX_ATTEMPTS,
  backoffMs,
  classifyError,
  dueJobs,
  enqueue,
  flush,
  mergeOutcome,
  recordFailure,
  release,
  syncState,
  type OutboxJob,
  type SendResult,
} from "./syncQueue"

const T0 = 1_000_000
const round = (key: string, payload: unknown = {}) => ({ key, kind: "round" as const, payload })
const ok: SendResult = { ok: true }
const offline: SendResult = { ok: false, permanent: false, message: "Failed to fetch" }
const rejected: SendResult = { ok: false, permanent: true, message: "Enter a score." }

function build(keys: string[]): OutboxJob[] {
  return keys.reduce<OutboxJob[]>((jobs, k) => enqueue(jobs, round(k), T0), [])
}

describe("enqueue", () => {
  it("keeps arrival order", () => {
    const jobs = build(["a", "b", "c"])
    expect(jobs.map((j) => [j.key, j.seq])).toEqual([["a", 1], ["b", 2], ["c", 3]])
  })

  it("dedupes by key: the same round queued twice is one job with the newest payload and its old place", () => {
    let jobs = build(["a", "b"])
    jobs = enqueue(jobs, round("a", { v: 2 }), T0 + 10)
    expect(jobs).toHaveLength(2)
    const a = jobs.find((j) => j.key === "a")!
    expect(a.payload).toEqual({ v: 2 })
    expect(a.seq).toBe(1)
  })

  it("re-queuing resets a job that was backing off or parked", () => {
    let jobs = build(["a"])
    jobs = [recordFailure(jobs[0], rejected, T0)]
    expect(jobs[0].blocked).toBe(true)
    jobs = enqueue(jobs, round("a"), T0 + 5)
    expect(jobs[0]).toMatchObject({ blocked: false, attempts: 0, nextAttemptAt: T0 + 5, lastError: null })
  })

  it("a new job gets a seq after the highest one, even after earlier jobs were removed", () => {
    let jobs = build(["a", "b"]).filter((j) => j.key !== "a")
    jobs = enqueue(jobs, round("c"), T0)
    expect(jobs.find((j) => j.key === "c")!.seq).toBe(3)
  })
})

describe("backoffMs", () => {
  const mid = () => 0.5 // no jitter at the middle of the spread
  it("doubles each attempt from the base", () => {
    expect(backoffMs(1, mid)).toBe(BACKOFF_BASE_MS)
    expect(backoffMs(2, mid)).toBe(BACKOFF_BASE_MS * 2)
    expect(backoffMs(3, mid)).toBe(BACKOFF_BASE_MS * 4)
  })
  it("never exceeds the cap (plus jitter)", () => {
    expect(backoffMs(30, mid)).toBe(BACKOFF_MAX_MS)
    expect(backoffMs(30, () => 0.999999)).toBeLessThanOrEqual(Math.round(BACKOFF_MAX_MS * (1 + BACKOFF_JITTER)))
  })
  it("jitter stays within +-BACKOFF_JITTER of the base", () => {
    expect(backoffMs(1, () => 0)).toBe(Math.round(BACKOFF_BASE_MS * (1 - BACKOFF_JITTER)))
    expect(backoffMs(1, () => 0.999999)).toBeLessThanOrEqual(Math.round(BACKOFF_BASE_MS * (1 + BACKOFF_JITTER)))
  })
})

describe("flush", () => {
  it("sends in order and empties the queue", async () => {
    const order: string[] = []
    const out = await flush(build(["a", "b", "c"]), T0, async (j) => {
      order.push(j.key)
      return ok
    })
    expect(order).toEqual(["a", "b", "c"])
    expect(out.jobs).toEqual([])
    expect(out.sent).toEqual(["a", "b", "c"])
  })

  it("a temporary failure stops the flush so later jobs never overtake it", async () => {
    const tried: string[] = []
    const out = await flush(build(["a", "b", "c"]), T0, async (j) => {
      tried.push(j.key)
      return j.key === "b" ? offline : ok
    }, () => 0.5)
    expect(tried).toEqual(["a", "b"])
    expect(out.sent).toEqual(["a"])
    expect(out.jobs.map((j) => j.key)).toEqual(["b", "c"])
    const b = out.jobs.find((j) => j.key === "b")!
    expect(b).toMatchObject({ attempts: 1, blocked: false, nextAttemptAt: T0 + BACKOFF_BASE_MS, lastError: "Failed to fetch" })
  })

  it("a job still backing off is skipped until it is due, then retried and removed", async () => {
    let jobs = (await flush(build(["a"]), T0, async () => offline, () => 0.5)).jobs
    const tooSoon = await flush(jobs, T0 + 1, async () => ok)
    expect(tooSoon.sent).toEqual([])
    const later = await flush(tooSoon.jobs, T0 + BACKOFF_BASE_MS, async () => ok)
    expect(later.sent).toEqual(["a"])
    expect(later.jobs).toEqual([])
    jobs = later.jobs
    expect(jobs).toHaveLength(0)
  })

  it("retries grow slower with every failure", async () => {
    let jobs = build(["a"])
    const waits: number[] = []
    let now = T0
    for (let i = 0; i < 4; i++) {
      jobs = (await flush(jobs, now, async () => offline, () => 0.5)).jobs
      waits.push(jobs[0].nextAttemptAt - now)
      now = jobs[0].nextAttemptAt
    }
    expect(waits).toEqual([BACKOFF_BASE_MS, BACKOFF_BASE_MS * 2, BACKOFF_BASE_MS * 4, BACKOFF_BASE_MS * 8])
  })

  it("a permanent failure parks that job and the rest still go", async () => {
    const out = await flush(build(["a", "b", "c"]), T0, async (j) => (j.key === "a" ? rejected : ok))
    expect(out.sent).toEqual(["b", "c"])
    expect(out.jobs).toHaveLength(1)
    expect(out.jobs[0]).toMatchObject({ key: "a", blocked: true, lastError: "Enter a score." })
  })

  it("parks a job that has failed MAX_ATTEMPTS times, and carries on to the next", async () => {
    let jobs = build(["a", "b"])
    jobs = jobs.map((j) => (j.key === "a" ? { ...j, attempts: MAX_ATTEMPTS - 1 } : j))
    const out = await flush(jobs, T0, async (j) => (j.key === "a" ? offline : ok))
    expect(out.jobs.find((j) => j.key === "a")!.blocked).toBe(true)
    expect(out.sent).toEqual(["b"])
  })

  it("sending twice never duplicates: a job that was sent is gone, one that was re-queued is sent once", async () => {
    const sentPayloads: unknown[] = []
    let jobs = enqueue(build(["r1"]), round("r1", { v: 2 }), T0)
    jobs = enqueue(jobs, round("r1", { v: 3 }), T0)
    const out = await flush(jobs, T0, async (j) => {
      sentPayloads.push(j.payload)
      return ok
    })
    expect(sentPayloads).toEqual([{ v: 3 }])
    const again = await flush(out.jobs, T0, async () => {
      throw new Error("should not send")
    })
    expect(again.sent).toEqual([])
  })
})

describe("dueJobs / release / syncState", () => {
  it("never returns parked or not-yet-due jobs", () => {
    let jobs = build(["a", "b", "c"])
    jobs = jobs.map((j) => (j.key === "a" ? { ...j, blocked: true } : j.key === "b" ? { ...j, nextAttemptAt: T0 + 50 } : j))
    expect(dueJobs(jobs, T0).map((j) => j.key)).toEqual(["c"])
    expect(dueJobs(jobs, T0 + 50).map((j) => j.key)).toEqual(["b", "c"])
  })

  it("release (signing in) makes parked jobs due again", () => {
    let jobs = build(["a"])
    jobs = [recordFailure(jobs[0], { permanent: true, message: "Sign in to save rounds." }, T0)]
    expect(dueJobs(jobs, T0 + 1)).toEqual([])
    jobs = release(jobs, T0 + 1)
    expect(dueJobs(jobs, T0 + 1)).toHaveLength(1)
  })

  it("syncState: idle when empty, pending while any job can still go, blocked when all are parked", () => {
    expect(syncState([])).toBe("idle")
    const jobs = build(["a", "b"])
    expect(syncState(jobs)).toBe("pending")
    expect(syncState(jobs.map((j) => ({ ...j, blocked: true })))).toBe("blocked")
    expect(syncState(jobs.map((j, i) => ({ ...j, blocked: i === 0 })))).toBe("pending")
  })
})

describe("classifyError", () => {
  it("offline or a fetch failure is temporary", () => {
    expect(classifyError(new TypeError("Failed to fetch"), true).permanent).toBe(false)
    expect(classifyError(new Error("anything"), false).permanent).toBe(false)
    expect(classifyError(new Error("Load failed"), true).permanent).toBe(false)
  })
  it("sign-in and validation refusals are permanent", () => {
    expect(classifyError(new Error("Sign in to save rounds."), true).permanent).toBe(true)
    expect(classifyError(new Error("Enter a score."), true).permanent).toBe(true)
    expect(classifyError(new Error('new row violates row-level security policy for table "rounds"'), true).permanent).toBe(true)
  })
  it("an unknown server error is retried", () => {
    expect(classifyError(new Error("Internal Server Error"), true).permanent).toBe(false)
  })
})

describe("mergeOutcome", () => {
  it("removes what was sent, applies failures, and keeps jobs added or re-queued while sending", async () => {
    const before = build(["a", "b", "c"])
    const outcome = await flush(before, T0, async (j) => (j.key === "a" ? ok : j.key === "b" ? offline : ok), () => 0.5)
    // While that was sending: "c" was re-saved with a newer payload and "d" arrived.
    let stored = enqueue(before, round("c", { v: 2 }), T0 + 1)
    stored = enqueue(stored, round("d"), T0 + 1)
    const merged = mergeOutcome(stored, before, outcome)
    expect(merged.map((j) => j.key)).toEqual(["b", "c", "d"])
    expect(merged.find((j) => j.key === "b")!.attempts).toBe(1)
    expect(merged.find((j) => j.key === "c")!.payload).toEqual({ v: 2 })
  })
})
