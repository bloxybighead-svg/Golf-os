// Coordinate transform between "golf space" (yards, tee at the origin,
// carry increasing downrange) and "screen space" (pixels, y increasing
// downward like every browser canvas/SVG).

export interface YardPoint {
  carryYds: number
  offlineYds: number // left = negative, right = positive
}

export interface PixelPoint {
  x: number
  y: number
}

export interface TransformConfig {
  originX: number // pixel x of the tee
  originY: number // pixel y of the tee
  scale: number // pixels per yard
}

/** Pixels-per-yard scale that fits a given yardage span into a pixel span. */
export function makeScale(viewportYds: number, viewportPx: number): number {
  return viewportPx / viewportYds
}

export function yardsToPixels(p: YardPoint, cfg: TransformConfig): PixelPoint {
  return {
    x: cfg.originX + p.offlineYds * cfg.scale,
    // carry grows downrange, which is "up" on screen, hence the subtraction
    y: cfg.originY - p.carryYds * cfg.scale,
  }
}

export function pixelsToYards(p: PixelPoint, cfg: TransformConfig): YardPoint {
  return {
    offlineYds: (p.x - cfg.originX) / cfg.scale,
    carryYds: (cfg.originY - p.y) / cfg.scale,
  }
}
