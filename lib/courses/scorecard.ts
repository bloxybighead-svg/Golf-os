// A course's scorecard (tees with ratings, holes with par and stroke index)
// from an OpenGolfAPI course record, and how a picked tee fills the round
// form. Checked against a real response (Pebble Beach, 2026-10-01): each tee
// has course_rating, slope, par, yardage and gender; holes_data has number,
// par and handicap_index (the stroke index). Ratings are for 18 holes only.

import { ratingForHoles } from "@/lib/rounds/activeRound"

export interface ScorecardTee {
  /** e.g. "Gold (Male)" -- name plus gender, since each has its own rating. */
  label: string
  courseRating: number
  slopeRating: number
  par: number
  yardage: number | null
}

export interface ScorecardHole {
  number: number
  par: number
  strokeIndex: number | null
}

export interface Scorecard {
  tees: ScorecardTee[]
  holes: ScorecardHole[]
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function parseScorecard(raw: unknown): Scorecard {
  const c = (raw ?? {}) as { tees?: unknown; holes_data?: unknown }
  const tees: ScorecardTee[] = []
  for (const t of Array.isArray(c.tees) ? c.tees : []) {
    const rating = num(t?.course_rating)
    const slope = num(t?.slope)
    const par = num(t?.par)
    if (rating == null || slope == null || par == null || slope < 55 || slope > 155) continue
    const name = typeof t?.tee_name === "string" && t.tee_name ? t.tee_name : "Tee"
    const gender = typeof t?.gender === "string" && t.gender ? ` (${t.gender})` : ""
    tees.push({ label: `${name}${gender}`, courseRating: rating, slopeRating: slope, par, yardage: num(t?.yardage) })
  }
  const holes: ScorecardHole[] = []
  for (const h of Array.isArray(c.holes_data) ? c.holes_data : []) {
    const number = num(h?.number)
    const par = num(h?.par)
    if (number == null || par == null || number < 1 || number > 18 || par < 3 || par > 6) continue
    const si = num(h?.handicap_index)
    holes.push({ number, par, strokeIndex: si != null && si >= 1 && si <= 18 ? si : null })
  }
  holes.sort((a, b) => a.number - b.number)
  return { tees, holes }
}

/**
 * What a picked tee fills in for a round of `holes` holes: the rating for
 * those holes (half for 9, as Play does -- OpenGolfAPI has no 9-hole
 * ratings, so it's approximate and stays editable), the slope as is, and par.
 */
export function teeFill(tee: ScorecardTee, holes: number): { courseRating: number; slopeRating: number; par: number } {
  return {
    courseRating: ratingForHoles(tee.courseRating, holes),
    slopeRating: tee.slopeRating,
    par: holes >= 18 ? tee.par : Math.round((tee.par * holes) / 18),
  }
}
