import { describe, expect, it } from "vitest"
import { clientIp, hitRateLimit, RATE_LIMITS, rateLimitBucket } from "./rateLimit"

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
    expect(RATE_LIMITS.search).toEqual({ max: 30, windowSeconds: 60 })
    expect(RATE_LIMITS.tees).toEqual({ max: 30, windowSeconds: 60 })
    expect(RATE_LIMITS.scorecard).toEqual({ max: 30, windowSeconds: 60 })
    expect(RATE_LIMITS.geometryMiss).toEqual({ max: 10, windowSeconds: 3600 })
  })

  it("lets requests through when the service key isn't configured (never breaks the app)", async () => {
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    try {
      expect(await hitRateLimit("search", "search:ip:test")).toBe(true)
    } finally {
      if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved
    }
  })
})
