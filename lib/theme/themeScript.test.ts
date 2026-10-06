import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { THEME_INIT_SCRIPT } from "./themeScript"

describe("theme init script CSP hash", () => {
  it("next.config.mjs allows the exact script layout.tsx inlines", () => {
    const hash = createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")
    const config = readFileSync("next.config.mjs", "utf8")
    expect(config).toContain(`'sha256-${hash}'`)
  })
})
