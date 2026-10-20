import { describe, expect, it } from "vitest"
import { buildCsp } from "./csp"

const csp = buildCsp("abc123", "https://example.supabase.co")
const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(name + " ")) ?? ""

describe("buildCsp", () => {
  it("never allows eval", () => {
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it("lets scripts run only by nonce (and the hashed theme script), never inline", () => {
    const script = directive("script-src")
    expect(script).toContain("'nonce-abc123'")
    expect(script).not.toContain("'unsafe-inline'")
  })
})
