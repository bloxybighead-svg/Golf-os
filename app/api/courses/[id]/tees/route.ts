import { NextRequest, NextResponse } from "next/server"
import { clientIp, hitRateLimit, rateLimitBucket, rateLimitedResponse } from "@/lib/supabase/rateLimit"

const OPENGOLFAPI_BASE = "https://api.opengolfapi.org/api/v1"

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const limit = await hitRateLimit("tees", rateLimitBucket("tees", { ip: clientIp(req.headers) }))
  if (!limit.allowed) return rateLimitedResponse(limit, "Too many tee lookups. Try again in a minute.", 60)
  const res = await fetch(`${OPENGOLFAPI_BASE}/courses/${encodeURIComponent(params.id)}/tees`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    return NextResponse.json({ error: "Tee lookup failed" }, { status: 502 })
  }
  const data = await res.json()
  return NextResponse.json({ tees: data.tees ?? [] })
}
