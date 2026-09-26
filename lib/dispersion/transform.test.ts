import { describe, it, expect } from "vitest"
import { yardsToPixels, pixelsToYards, makeScale, type TransformConfig } from "./transform"

describe("makeScale", () => {
  it("computes pixels-per-yard for a given viewport", () => {
    expect(makeScale(100, 500)).toBe(5) // 500px covering 100 yards = 5 px/yd
  })
})

describe("yardsToPixels / pixelsToYards", () => {
  const cfg: TransformConfig = { originX: 300, originY: 800, scale: 4 }

  it("maps the tee (0,0 yards) to the origin pixel", () => {
    expect(yardsToPixels({ carryYds: 0, offlineYds: 0 }, cfg)).toEqual({ x: 300, y: 800 })
  })

  it("maps carry to negative pixel-y (up the screen) and offline to positive pixel-x (right)", () => {
    const px = yardsToPixels({ carryYds: 150, offlineYds: 10 }, cfg)
    expect(px).toEqual({ x: 300 + 10 * 4, y: 800 - 150 * 4 })
  })

  it("maps a left miss to a smaller pixel-x than the origin", () => {
    const px = yardsToPixels({ carryYds: 100, offlineYds: -20 }, cfg)
    expect(px.x).toBeLessThan(cfg.originX)
  })

  it("round-trips yards -> pixels -> yards", () => {
    const original = { carryYds: 237.4, offlineYds: -18.6 }
    const roundTripped = pixelsToYards(yardsToPixels(original, cfg), cfg)
    expect(roundTripped.carryYds).toBeCloseTo(original.carryYds, 6)
    expect(roundTripped.offlineYds).toBeCloseTo(original.offlineYds, 6)
  })
})
