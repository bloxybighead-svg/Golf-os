import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { fakeClient } from "@/lib/supabase/fakeClient"

const db = vi.hoisted(() => ({ current: null as ReturnType<typeof import("@/lib/supabase/fakeClient").fakeClient> | null }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.current!.client }))
vi.mock("@/components/you/SubPageHeader", () => ({ SubPageHeader: () => null }))

import OlderSessionsPage from "./page"

describe("older sessions", () => {
  it("shows a run with no location as nothing, not as null", async () => {
    db.current = fakeClient({ practice_runs: [{ id: "r1", run_date: "2026-10-01", location: null, started_at: "2026-10-01T12:00:00Z", ended_at: "2026-10-01T12:30:00Z" }] })
    const html = renderToStaticMarkup(await OlderSessionsPage())
    expect(html).toContain("2026-10-01")
    expect(html).not.toContain("null")
  })
})
