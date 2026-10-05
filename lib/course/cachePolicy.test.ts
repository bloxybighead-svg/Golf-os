import { describe, expect, it } from "vitest"
import { decideCacheWrite, type CacheWriteInput } from "./cachePolicy"

const PEBBLE = { lat: 36.5685, lng: -121.949 }
const base: CacheWriteInput = { hasId: true, server: PEBBLE, client: PEBBLE, holes: 18, scope: "course-area" }

describe("decideCacheWrite", () => {
  it("writes when the id's real location matches what was fetched", () => {
    expect(decideCacheWrite(base)).toEqual({ write: true })
    // a few hundred metres of client drift is fine
    expect(decideCacheWrite({ ...base, client: { lat: 36.5705, lng: -121.949 } })).toEqual({ write: true })
  })

  it("refuses when the client location is 5 km from the course", () => {
    const d = decideCacheWrite({ ...base, client: { lat: PEBBLE.lat + 0.045, lng: PEBBLE.lng } })
    expect(d.write).toBe(false)
  })

  it("refuses a different course entirely (id of Pebble Beach, lat/lng of another state)", () => {
    expect(decideCacheWrite({ ...base, client: { lat: 40.7, lng: -74.0 } }).write).toBe(false)
  })

  it("refuses when the server lookup failed", () => {
    expect(decideCacheWrite({ ...base, server: null })).toEqual({ write: false, reason: "lookup-failed" })
  })

  it("refuses when there is no id", () => {
    expect(decideCacheWrite({ ...base, hasId: false, server: null })).toEqual({ write: false, reason: "no-id" })
    expect(decideCacheWrite({ ...base, hasId: false }).write).toBe(false)
  })

  it("still refuses radius-scope results and implausible hole counts", () => {
    expect(decideCacheWrite({ ...base, scope: "radius" }).write).toBe(false)
    expect(decideCacheWrite({ ...base, holes: 27 }).write).toBe(false)
  })
})
