import { NextRequest, NextResponse } from "next/server"

const OPENGOLFAPI_BASE = "https://api.opengolfapi.org/api/v1"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await fetch(`${OPENGOLFAPI_BASE}/courses/${encodeURIComponent(params.id)}/tees`, {
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    return NextResponse.json({ error: "Tee lookup failed" }, { status: 502 })
  }
  const data = await res.json()
  return NextResponse.json({ tees: data.tees ?? [] })
}
