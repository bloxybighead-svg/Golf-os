import type { Lie } from "@/lib/course/lies"
import { cssColor } from "@/lib/theme/tokens"

// Kept out of CourseMap.tsx so server-rendered code can import it without
// pulling in Leaflet (which needs `window`).
export type Placing = "ball" | "aim" | "pin"

// Token names (app/globals.css). The map's own layers need concrete values
// (readColor), everything else can use lieColor.
export const LIE_TOKEN: Record<Lie, string> = {
  green: "lie-green",
  fairway: "lie-fairway",
  rough: "lie-rough",
  bunker: "lie-bunker",
  water: "lie-water",
  trees: "lie-trees",
  oob: "lie-oob",
}

/** A lie's color for inline styles. */
export const lieColor = (lie: Lie, alpha = 1) => cssColor(LIE_TOKEN[lie], alpha)
