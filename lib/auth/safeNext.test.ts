import { describe, it, expect } from "vitest"
import { safeNext, loginHref } from "./safeNext"

describe("safeNext", () => {
  it("allows same-site paths, queries and hashes", () => {
    expect(safeNext("/you")).toBe("/you")
    expect(safeNext("/rounds?new=1")).toBe("/rounds?new=1")
    expect(safeNext("/you#bag")).toBe("/you#bag")
  })
  it("rejects other sites and tricks browsers read as other sites", () => {
    for (const bad of ["https://evil.example", "http://evil.example/x", "//evil.example", String.raw`/\evil.example`, "javascript:alert(1)", "evil.example", "/a\nb", "/\t/evil.example"]) {
      expect(safeNext(bad)).toBe("/")
    }
  })
  it("falls back when missing and honours a custom fallback", () => {
    expect(safeNext(null)).toBe("/")
    expect(safeNext("", "/you")).toBe("/you")
  })
})

describe("loginHref", () => {
  it("encodes the destination", () => {
    expect(loginHref("/rounds?new=1")).toBe("/login?next=%2Frounds%3Fnew%3D1")
  })
  it("never builds a link to another site", () => {
    expect(loginHref("//evil.example")).toBe("/login?next=%2F")
  })
})
