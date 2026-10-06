import { NextRequest, NextResponse } from "next/server"
import { parseScorecard } from "@/lib/courses/scorecard"
import { clientIp, hitRateLimit, rateLimitBucket, rateLimitedResponse } from "@/lib/supabase/rateLimit"

// A course's scorecard from OpenGolfAPI in one call: every tee's 18-hole
// Course Rating, Slope Rating and par (men's and women's listed separately),
// plus each hole's par and stroke index. Feeds the round form's autofill.
// Free, keyless, ODbL-licensed: https://opengolfapi.org/
const OPENGOLFAPI_BASE = "https://api.opengolfapi.org/api/v1"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const limit = await hitRateLimit("scorecard", rateLimitBucket("scorecard", { ip: clientIp(req.headers) }))
  if (!limit.allowed) return rateLimitedResponse(limit, "Too many scorecard lookups. Try again in a minute.", 60)
  const res = await fetch(`${OPENGOLFAPI_BASE}/courses/${encodeURIComponent(params.id)}`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    return NextResponse.json({ error: "Scorecard lookup failed" }, { status: 502 })
  }
  return NextResponse.json(parseScorecard(await res.json()))
}
