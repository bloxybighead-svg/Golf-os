import type { Lie } from "@/lib/course/lies"

// Kept out of CourseMap.tsx so server-rendered code can import it without
// pulling in Leaflet (which needs `window`).
export type Placing = "ball" | "aim" | "pin"

export const LIE_COLORS: Record<Lie, string> = {
  green: "#ffffff",
  fairway: "#86efac",
  rough: "#fbbf24",
  bunker: "#f472b6",
  water: "#38bdf8",
  trees: "#c084fc",
  oob: "#ef4444",
}
