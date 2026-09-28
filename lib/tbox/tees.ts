import type { TeeOption } from "./estimate"

/** One tee as OpenGolfAPI returns it (via /api/courses/[id]/tees). */
export interface OpenGolfApiTee {
  tee_name: string
  gender: string
  course_rating: number
  slope: number
  par: number
  yardage: number
}

/**
 * The course's tees as TeeOptions, one per tee. OpenGolfAPI lists a tee once
 * per rating (men's and women's), so this keeps the men's ratings when a
 * course has any -- the app has no gender setting yet -- and otherwise all.
 */
export function teeOptionsFrom(raw: OpenGolfApiTee[]): TeeOption[] {
  const valid = raw.filter((t) => t.yardage > 0 && t.slope > 0 && t.course_rating > 0 && t.par > 0)
  const mens = valid.filter((t) => t.gender === "Male")
  const chosen = mens.length > 0 ? mens : valid
  const seen = new Set<string>()
  const out: TeeOption[] = []
  for (const t of chosen) {
    if (seen.has(t.tee_name)) continue
    seen.add(t.tee_name)
    out.push({ name: t.tee_name, totalYardage: t.yardage, courseRating: t.course_rating, slopeRating: t.slope, par: t.par })
  }
  return out.sort((a, b) => b.totalYardage - a.totalYardage) // longest first
}

/** The next longer and next shorter tee around `name` (list must be longest first). */
export function neighbourTees(tees: TeeOption[], name: string): { longer: TeeOption | null; shorter: TeeOption | null } {
  const i = tees.findIndex((t) => t.name === name)
  if (i < 0) return { longer: null, shorter: null }
  return { longer: tees[i - 1] ?? null, shorter: tees[i + 1] ?? null }
}
