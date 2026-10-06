import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clientIp, RATE_LIMITS, rateLimitBucket } from "./rateLimit"

describe("rate limit helpers", () => {
  it("reads the caller's IP from Vercel's headers", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7")
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1")
    expect(clientIp(new Headers())).toBe("unknown")
  })

  it("keeps search, tees and scorecard in separate buckets, so typing in search can't block a tee lookup", () => {
    const ip = "203.0.113.7"
    const buckets = (["search", "tees", "scorecard"] as const).map((k) => rateLimitBucket(k, { ip }))
    expect(new Set(buckets).size).toBe(3)
    expect(buckets[0]).toBe("search:ip:203.0.113.7")
    expect(rateLimitBucket("geometryMiss", { userId: "u1" })).toBe("geometry-miss:user:u1")
  })

  it("uses the agreed limits", () => {
    expect(RATE_LIMITS.search).toEqual({ max: 30, windowSeconds: 60, failMode: "open" })
    expect(RATE_LIMITS.tees).toEqual({ max: 30, windowSeconds: 60, failMode: "open" })
    expect(RATE_LIMITS.scorecard).toEqual({ max: 30, windowSeconds: 60, failMode: "open" })
    expect(RATE_LIMITS.geometryMiss).toEqual({ max: 10, windowSeconds: 3600, failMode: "closed" })
  })

  it("marks the expensive upstream calls closed and the cheap lookups open", () => {
    expect(RATE_LIMITS.geometryMiss.failMode).toBe("closed")
    expect(RATE_LIMITS.elevation.failMode).toBe("closed")
    expect(RATE_LIMITS.search.failMode).toBe("open")
    expect(RATE_LIMITS.tees.failMode).toBe("open")
    expect(RATE_LIMITS.scorecard.failMode).toBe("open")
  })
})

describe("hitRateLimit when the limiter is down", () => {
  const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ENV", "NODE_ENV"] as const
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k]
    vi.spyOn(console, "warn").mockImplementation(() => {})
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  })
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete (process.env as Record<string, string | undefined>)[k]
      else (process.env as Record<string, string | undefined>)[k] = saved[k]
    }
    vi.restoreAllMocks()
    vi.resetModules()
    vi.doUnmock("@supabase/supabase-js")
  })

  /** Loads a fresh module whose database call returns `rpc`, with the given environment. */
  async function load(env: { vercel?: string; node: string; key: boolean }, rpc?: () => Promise<{ data: unknown; error: { message: string } | null }>) {
    const e = process.env as Record<string, string | undefined>
    e.NODE_ENV = env.node
    if (env.vercel === undefined) delete e.VERCEL_ENV
    else e.VERCEL_ENV = env.vercel
    if (env.key) e.SUPABASE_SERVICE_ROLE_KEY = "service"
    else delete e.SUPABASE_SERVICE_ROLE_KEY
    vi.resetModules()
    vi.doMock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: rpc ?? (async () => ({ data: true, error: null })) }) }))
    return import("./rateLimit")
  }

  const prod = { vercel: "production", node: "production" }
  const dev = { node: "development" }
  const failing = async () => ({ data: null, error: { message: "boom" } })
  const throwing = async () => {
    throw new Error("network")
  }

  it("fails closed for expensive kinds in production when the key is missing", async () => {
    const { hitRateLimit } = await load({ ...prod, key: false })
    expect(await hitRateLimit("geometryMiss", "b")).toEqual({ allowed: false, reason: "error" })
    expect(await hitRateLimit("elevation", "b")).toEqual({ allowed: false, reason: "error" })
  })

  it("fails closed for expensive kinds in production when the call errors or throws", async () => {
    for (const rpc of [failing, throwing]) {
      const { hitRateLimit } = await load({ ...prod, key: true }, rpc)
      expect(await hitRateLimit("elevation", "b")).toEqual({ allowed: false, reason: "error" })
    }
  })

  it("treats either VERCEL_ENV=production or NODE_ENV=production as production", async () => {
    const a = await load({ vercel: "production", node: "development", key: false })
    expect((await a.hitRateLimit("elevation", "b")).allowed).toBe(false)
    const b = await load({ node: "production", key: false })
    expect((await b.hitRateLimit("elevation", "b")).allowed).toBe(false)
  })

  it("fails open for cheap kinds in production (and says the limiter was down)", async () => {
    const { hitRateLimit } = await load({ ...prod, key: false })
    for (const kind of ["search", "tees", "scorecard"] as const) {
      expect(await hitRateLimit(kind, "b")).toEqual({ allowed: true, reason: "error" })
    }
    const errored = await load({ ...prod, key: true }, failing)
    expect((await errored.hitRateLimit("search", "b")).allowed).toBe(true)
  })

  it("fails open for every kind in dev, so a missing key doesn't break local work", async () => {
    const { hitRateLimit } = await load({ ...dev, key: false })
    for (const kind of ["search", "tees", "scorecard", "elevation", "geometryMiss"] as const) {
      expect((await hitRateLimit(kind, "b")).allowed).toBe(true)
    }
    const errored = await load({ ...dev, key: true }, failing)
    expect((await errored.hitRateLimit("geometryMiss", "b")).allowed).toBe(true)
  })

  it("separates 'over the limit' from 'limiter down' when the database answers", async () => {
    const over = await load({ ...prod, key: true }, async () => ({ data: false, error: null }))
    expect(await over.hitRateLimit("geometryMiss", "b")).toEqual({ allowed: false, reason: "limit" })
    const ok = await load({ ...prod, key: true }, async () => ({ data: true, error: null }))
    expect(await ok.hitRateLimit("geometryMiss", "b")).toEqual({ allowed: true })
  })

  it("answers 429 for a hit limit and 503 (no-store) for a down limiter", async () => {
    const { rateLimitedResponse } = await load({ ...prod, key: true })
    const limited = rateLimitedResponse({ allowed: false, reason: "limit" }, "too many", 60)
    expect(limited.status).toBe(429)
    expect(limited.headers.get("Cache-Control")).toBe("no-store")
    const down = rateLimitedResponse({ allowed: false, reason: "error" }, "too many", 60)
    expect(down.status).toBe(503)
    expect(down.headers.get("Cache-Control")).toBe("no-store")
    expect((await down.json()).error).toBe("Service is busy, try again in a moment")
  })
})
