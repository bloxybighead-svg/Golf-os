import { NextRequest, NextResponse } from "next/server"

// Proxies OpenGolfAPI's course search so the browser never talks to a
// third-party host directly (keeps it server-controlled, avoids CORS).
// Free, keyless, ODbL-licensed: https://opengolfapi.org/
const OPENGOLFAPI_BASE = "https://api.opengolfapi.org/api/v1"

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ courses: [] })
  }

  const res = await fetch(`${OPENGOLFAPI_BASE}/courses/search?q=${encodeURIComponent(q)}`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    return NextResponse.json({ error: "Course search failed" }, { status: 502 })
  }
  const data = await res.json()
  // OpenGolfAPI's `name` field isn't reliably populated (missing for some
  // courses, e.g. multi-word queries like "Spyglass Hill" only return
  // `course_name`) -- that field is present on every result seen so far.
  const courses = (data.courses ?? [])
    .slice(0, 15)
    .map((c: { id: string; name?: string; course_name?: string; city: string | null; state: string | null; par: number | null }) => ({
      id: c.id,
      name: c.course_name ?? c.name ?? "Unnamed course",
      city: c.city,
      state: c.state,
      par: c.par,
    }))
  return NextResponse.json({ courses })
}
