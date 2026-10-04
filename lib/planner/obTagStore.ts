// The golfer's OB tags per hole (lib/course/obTags.ts makes the zones): the
// pure edits, the device storage, and the row shape for Supabase
// (hole_ob_tags, supabase/hole_ob_tags.sql).

import { clampMargin, type ObAnswer, type ObSide, type ObTag } from "@/lib/course/obTags"
import { OB_MARGIN_YDS } from "@/lib/course/strategy"

/** holeId (the hole's OSM way id) -> its tags. */
export type HoleObTags = Record<string, ObTag[]>

const SIDES: readonly ObAnswer[] = ["left", "right", "long", "none"]

/** Tap an "OB left / right / long" tag: adds it if absent, removes it if present. Any side clears a "none". */
export function toggleSide(tags: ObTag[], side: ObSide, marginYds: number = OB_MARGIN_YDS): ObTag[] {
  const has = tags.some((t) => t.side === side)
  if (has) return tags.filter((t) => t.side !== side)
  const margin = tags.find((t) => t.side !== "none")?.marginYds ?? marginYds
  return [...tags.filter((t) => t.side !== "none"), { side, marginYds: clampMargin(margin) }]
}

/** The banner's one-tap answer: Left / Right / Both / None. Replaces whatever was there. */
export function answerBanner(answer: "left" | "right" | "both" | "none", marginYds: number = OB_MARGIN_YDS): ObTag[] {
  const m = clampMargin(marginYds)
  if (answer === "none") return [{ side: "none", marginYds: m }]
  if (answer === "both") return [{ side: "left", marginYds: m }, { side: "right", marginYds: m }]
  return [{ side: answer, marginYds: m }]
}

/** Moves every side tag's stakes to `marginYds` from the fairway edge. */
export function withMargin(tags: ObTag[], marginYds: number): ObTag[] {
  const m = clampMargin(marginYds)
  return tags.map((t) => (t.side === "none" ? t : { ...t, marginYds: m }))
}

/** True once the golfer has said anything about this hole's OB (a side, or "none"): the banner stays away. */
export function hasAnswered(tags: ObTag[] | undefined): boolean {
  return !!tags && tags.length > 0
}

export function cleanTags(raw: unknown): ObTag[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ObTag[] = []
  for (const t of raw) {
    if (!t || !SIDES.includes(t.side) || seen.has(t.side)) continue
    seen.add(t.side)
    out.push({ side: t.side, marginYds: clampMargin(Number(t.marginYds ?? t.margin_yds)) })
  }
  return out
}

export function obTagsKey(courseId: string): string {
  return `golfos.obTags.${courseId}.v1`
}

export function loadObTags(courseId: string): HoleObTags {
  try {
    const raw = localStorage.getItem(obTagsKey(courseId))
    if (!raw) return {}
    const v = JSON.parse(raw)
    if (!v || typeof v !== "object") return {}
    const out: HoleObTags = {}
    for (const [hole, tags] of Object.entries(v)) {
      const clean = cleanTags(tags)
      if (clean.length > 0) out[hole] = clean
    }
    return out
  } catch {
    return {}
  }
}

export function saveObTags(courseId: string, map: HoleObTags): void {
  try {
    localStorage.setItem(obTagsKey(courseId), JSON.stringify(map))
  } catch {
    /* storage full or blocked: tags just won't be remembered on this device */
  }
}

export interface ObTagRow {
  hole_id: string
  side: ObAnswer
  margin_yds: number
}

/** Supabase rows (hole_ob_tags) -> the per-hole map. */
export function rowsToMap(rows: ObTagRow[]): HoleObTags {
  const out: HoleObTags = {}
  for (const r of rows) {
    const t = cleanTags([{ side: r.side, margin_yds: Number(r.margin_yds) }])
    if (t.length > 0) out[r.hole_id] = [...(out[r.hole_id] ?? []), ...t]
  }
  return out
}
