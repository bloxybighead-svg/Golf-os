import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import type { SessionMeta, StoredShot } from "@/lib/shots/types"
import { fitProfiles, fitToRow } from "@/lib/golfer/shotProfile"

// The browser client needs project env vars that tests don't have; nothing here calls it.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }))

import { ShotDataClient } from "./ShotDataClient"
import { ImportFlow } from "./ImportFlow"
import { ManualEntry } from "./ManualEntry"

const sessions: SessionMeta[] = [
  { id: "a", label: "Range, Sept 20", date: "2026-09-20", environment: "outdoor", surface: "grass", excluded: false },
  { id: "b", label: "Garage net", date: "2026-08-01", environment: "indoor", surface: "mat", excluded: true },
]
const swings = (sessionId: string, club: StoredShot["club"], n: number, carry: number): StoredShot[] =>
  Array.from({ length: n }, (_, i) => ({ sessionId, club, carryYds: carry + (i % 6), offlineYds: (i % 5) - 2, curveYds: null, launchDirDeg: null, isPartial: false }))
const shots = [...swings("a", "7-Iron", 40, 150), ...swings("a", "PW", 8, 118), ...swings("b", "7-Iron", 5, 140)]
const profileRows = fitProfiles(sessions, shots, new Date("2026-10-01T00:00:00Z")).map((f) => ({ ...fitToRow(f), fitted_at: "2026-10-01T00:00:00Z" }))

describe("shot data components render", () => {
  it("the page: clubs with trust badges, sessions with delete, and delete-all", () => {
    const html = renderToStaticMarkup(<ShotDataClient userId="u1" initial={{ sessions, shots, profileRows }} />)
    expect(html).toContain("My shot data")
    expect(html).toContain("7-Iron")
    expect(html).toContain("Solid") // 40 irons shots
    expect(html).toContain("Thin") // 8 PW shots
    expect(html).toContain("Range, Sept 20")
    expect(html).toContain("Garage net")
    expect(html).toContain("1 of 2 sessions are in your profile")
    expect(html).toContain("Delete all my shot data")
    expect(html).toContain("7-Iron dispersion")
  })

  it("an empty account is told what to do", () => {
    const html = renderToStaticMarkup(<ShotDataClient userId="u1" initial={{ sessions: [], shots: [], profileRows: [] }} />)
    expect(html).toContain("No shots yet")
    expect(html).not.toContain("Delete all my shot data")
  })

  it("upload and manual entry are offered", () => {
    expect(renderToStaticMarkup(<ImportFlow busy={false} onSave={async () => undefined} />)).toContain("Upload a CSV")
    expect(renderToStaticMarkup(<ManualEntry busy={false} onSave={async () => undefined} />)).toContain("Type in shots")
  })
})
