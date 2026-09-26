// Tee-box recommendation: given a course's tee options (rating/slope/
// yardage per tee) plus a golfer's handicap and driver distance, suggest
// which tee they should actually play.

export interface TeeOption {
  name: string
  totalYardage: number
  courseRating: number
  slopeRating: number
  par: number
}

export interface Golfer {
  handicapIndex: number
  driverCarryYds: number
}

/**
 * USGA/R&A World Handicap System Course Handicap formula (Rule 6.1),
 * exact, not approximated:
 *   Course Handicap = Handicap Index x (Slope Rating / 113) + (Course Rating - Par)
 */
export function courseHandicap(handicapIndex: number, slopeRating: number, courseRating: number, par: number): number {
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - par))
}

// Approximates the shape of the USGA's 2011 "Tee It Forward" guidance,
// which pairs average driving distance with a recommended total course
// yardage band (e.g. roughly 300yd drives -> ~7000-7600yd courses, 200yd
// drives -> ~5200-5400yd courses). This single ratio reproduces that
// relationship from memory and should be swapped for the exact published
// table if precision matters -- flagged here the same way the simulator
// flags its own unsourced constants.
const APPROX_COURSE_YARDS_PER_DRIVE_YARD = 25

export function recommendedCourseYardage(driverCarryYds: number): number {
  return Math.round(driverCarryYds * APPROX_COURSE_YARDS_PER_DRIVE_YARD)
}

export interface TeeRecommendation {
  tee: TeeOption
  courseHandicap: number
  yardageFit: number // tee's total yardage minus the recommended yardage; <=0 means comfortable-or-under
}

export interface TeeBoxResult {
  recommended: TeeRecommendation
  all: TeeRecommendation[]
  recommendedYardage: number
}

/**
 * Picks the longest tee that doesn't exceed the golfer's recommended
 * yardage (more challenge without being an unreasonable reach), falling
 * back to the shortest available tee if every option is already longer
 * than recommended.
 */
export function recommendTee(golfer: Golfer, tees: TeeOption[]): TeeBoxResult {
  if (tees.length === 0) {
    throw new Error("recommendTee requires at least one tee option")
  }
  const recommendedYardage = recommendedCourseYardage(golfer.driverCarryYds)
  const all: TeeRecommendation[] = tees.map((tee) => ({
    tee,
    courseHandicap: courseHandicap(golfer.handicapIndex, tee.slopeRating, tee.courseRating, tee.par),
    yardageFit: tee.totalYardage - recommendedYardage,
  }))

  const withinReach = all.filter((t) => t.yardageFit <= 0)
  const recommended =
    withinReach.length > 0
      ? withinReach.reduce((best, t) => (t.tee.totalYardage > best.tee.totalYardage ? t : best))
      : all.reduce((shortest, t) => (t.tee.totalYardage < shortest.tee.totalYardage ? t : shortest))

  return { recommended, all, recommendedYardage }
}
