// Free rate limiting for the course API routes, backed by one Supabase table
// and function (supabase/api_rate_limits.sql). Called only from server routes
// with the service-role key (SUPABASE_SERVICE_ROLE_KEY, server-only).
//
// Search, tees and scorecard each have their own per-IP bucket, so typing in
// a search box can never block a tee lookup. Course geometry counts only real
// OpenStreetMap fetches (cache misses), per signed-in user.

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const RATE_LIMITS = {
  /** Course search: per IP. The search boxes wait 300 ms after typing and need 3+ characters. */
  search: { max: 30, windowSeconds: 60 },
  /** A course's tees: per IP. */
  tees: { max: 30, windowSeconds: 60 },
  /** A course's scorecard (tees + holes): per IP. */
  scorecard: { max: 30, windowSeconds: 60 },
  /** Course map data fetched fresh from OpenStreetMap (a cache miss or a refresh): per signed-in user. */
  geometryMiss: { max: 10, windowSeconds: 3600 },
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

let warned = false

/**
 * Counts one request against `kind`'s limit for this bucket. True when it's
 * allowed. Without the service key, or if the database call fails, it lets the
 * request through (and logs) rather than breaking the app.
 */
export async function hitRateLimit(kind: RateLimitKind, bucket: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) {
    if (!warned) console.warn("Rate limiting is off: SUPABASE_SERVICE_ROLE_KEY is not set.")
    warned = true
    return true
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
      return true
    }
    return data !== false
  } catch (e) {
    console.warn(`Rate limit check failed (${kind}): ${e instanceof Error ? e.message : "unknown"}`)
    return true
  }
}

/** A friendly 429 that's never cached. */
export function tooManyRequests(message: string, retryAfterSeconds: number) {
  return NextResponse.json(
    { error: message, rateLimited: true },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } }
  )
}
