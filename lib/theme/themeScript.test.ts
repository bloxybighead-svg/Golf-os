import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { THEME_SCRIPT_HASH } from "@/lib/security/csp"
import { THEME_INIT_SCRIPT } from "./themeScript"

describe("theme init script CSP hash", () => {
  it("the CSP allows the exact script layout.tsx inlines", () => {
    const hash = createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")
    expect(THEME_SCRIPT_HASH).toBe(`sha256-${hash}`)
  })
})
