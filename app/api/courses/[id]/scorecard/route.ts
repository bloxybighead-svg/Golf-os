import { NextRequest, NextResponse } from "next/server"
import { fetchScorecard } from "@/lib/courses/fetchScorecard"
import { clientIp, hitRateLimit, rateLimitBucket, rateLimitedResponse } from "@/lib/supabase/rateLimit"

// A course's scorecard from OpenGolfAPI in one call: every tee's 18-hole
// Course Rating, Slope Rating and par (men's and women's listed separately),
// plus each hole's par and stroke index. Feeds the round form's autofill.

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const limit = await hitRateLimit("scorecard", rateLimitBucket("scorecard", { ip: clientIp(req.headers) }))
  if (!limit.allowed) return rateLimitedResponse(limit, "Too many scorecard lookups. Try again in a minute.", 60)
  const card = await fetchScorecard(params.id)
  if (!card) return NextResponse.json({ error: "Scorecard lookup failed" }, { status: 502 })
  return NextResponse.json(card)
}
