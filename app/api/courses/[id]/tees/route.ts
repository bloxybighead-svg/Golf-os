import { NextRequest, NextResponse } from "next/server"
import { clientIp, hitRateLimit, rateLimitBucket, tooManyRequests } from "@/lib/supabase/rateLimit"

const OPENGOLFAPI_BASE = "https://api.opengolfapi.org/api/v1"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await hitRateLimit("tees", rateLimitBucket("tees", { ip: clientIp(req.headers) })))) {
    return tooManyRequests("Too many tee lookups. Try again in a minute.", 60)
  }
  const res = await fetch(`${OPENGOLFAPI_BASE}/courses/${encodeURIComponent(params.id)}/tees`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    return NextResponse.json({ error: "Tee lookup failed" }, { status: 502 })
  }
  const data = await res.json()
  return NextResponse.json({ tees: data.tees ?? [] })
}
