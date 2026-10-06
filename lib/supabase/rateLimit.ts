// Free rate limiting for the course API routes, backed by one Supabase table
// and function (supabase/api_rate_limits.sql). Called only from server routes
// with the service-role key (SUPABASE_SERVICE_ROLE_KEY, server-only).
//
// Search, tees and scorecard each have their own per-IP bucket, so typing in
// a search box can never block a tee lookup. Course geometry counts only real
// OpenStreetMap fetches (cache misses), per signed-in user.

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

/**
 * `failMode` is what happens in production when the limiter itself is down (no service key, or the
 * database call fails). "closed" blocks the request, for the expensive calls to the free upstream
 * servers (Overpass, USGS, Open-Meteo). "open" lets it through, for the cheap lookups, where
 * blocking would break the app for no real protection.
 */
export const RATE_LIMITS = {
  /** Course search: per IP. The search boxes wait 300 ms after typing and need 3+ characters. */
  search: { max: 30, windowSeconds: 60, failMode: "open" },
  /** A course's tees: per IP. */
  tees: { max: 30, windowSeconds: 60, failMode: "open" },
  /** A course's scorecard (tees + holes): per IP. */
  scorecard: { max: 30, windowSeconds: 60, failMode: "open" },
  /** Ground heights fetched fresh from USGS / Open-Meteo (a cache miss): per IP. A hole is one request, so this is generous. */
  elevation: { max: 20, windowSeconds: 60, failMode: "closed" },
  /** Course map data fetched fresh from OpenStreetMap (a cache miss or a refresh): per signed-in user. */
  geometryMiss: { max: 10, windowSeconds: 3600, failMode: "closed" },
} as const

export type RateLimitKind = keyof typeof RATE_LIMITS

/** The caller's IP as Vercel reports it (x-real-ip, else the first x-forwarded-for hop). */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim()
  if (real) return real
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return forwarded || "unknown"
}

export function rateLimitBucket(kind: RateLimitKind, who: { ip?: string; userId?: string }): string {
  const name = kind === "geometryMiss" ? "geometry-miss" : kind
  return who.userId ? `${name}:user:${who.userId}` : `${name}:ip:${who.ip ?? "unknown"}`
}

export type RateLimitResult =
  /** `reason: "error"` on an allowed result means the limiter was down and this kind fails open. */
  | { allowed: true; reason?: "error" }
  /** "limit": the caller is over the limit. "error": the limiter is down and this kind fails closed. */
  | { allowed: false; reason: "limit" | "error" }

/** True where a down limiter should block requests: production only, so local dev without the key still works. */
function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production"
}

/** What to answer when the limiter itself can't be used. */
function limiterDown(kind: RateLimitKind): RateLimitResult {
  return RATE_LIMITS[kind].failMode === "closed" && isProduction()
    ? { allowed: false, reason: "error" }
    : { allowed: true, reason: "error" }
}

let warned = false

/**
 * Counts one request against `kind`'s limit for this bucket. When the service key is missing or the
 * database call fails, the kind's `failMode` decides (see RATE_LIMITS); either way it logs.
 */
export async function hitRateLimit(kind: RateLimitKind, bucket: string): Promise<RateLimitResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) {
    if (!warned) console.warn("Rate limiting is unavailable: SUPABASE_SERVICE_ROLE_KEY is not set.")
    warned = true
    return limiterDown(kind)
  }
  const limit = RATE_LIMITS[kind]
  try {
    const db = createClient(url, service, { auth: { persistSession: false } })
    const { data, error } = await db.rpc("hit_rate_limit", {
      p_bucket: bucket,
      p_max: limit.max,
      p_window_seconds: limit.windowSeconds,
    })
    if (error) {
      console.warn(`Rate limit check failed (${kind}): ${error.message}`)
      return limiterDown(kind)
    }
    return data === false ? { allowed: false, reason: "limit" } : { allowed: true }
  } catch (e) {
    console.warn(`Rate limit check failed (${kind}): ${e instanceof Error ? e.message : "unknown"}`)
    return limiterDown(kind)
  }
}

/**
 * The response for a blocked request: 429 when the caller is over the limit, 503 when the limiter
 * is down and the route fails closed. Never cached.
 */
export function rateLimitedResponse(
  result: Extract<RateLimitResult, { allowed: false }>,
  limitMessage: string,
  retryAfterSeconds: number
) {
  if (result.reason === "error") {
    return NextResponse.json(
      { error: "Service is busy, try again in a moment", unavailable: true },
      { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } }
    )
  }
  return tooManyRequests(limitMessage, retryAfterSeconds)
}

/** A friendly 429 that's never cached. */
export function tooManyRequests(message: string, retryAfterSeconds: number) {
  return NextResponse.json(
    { error: message, rateLimited: true },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } }
  )
}
