
export const BREAKDOWN_TAGS = [
  'Decision-making',
  'Putting under pressure',
  'Swing tension/mechanics',
  'Course management',
  'None',
] as const
export type BreakdownTag = (typeof BREAKDOWN_TAGS)[number]

export interface Round {
  id: string
  date: string
  course_name: string
  holes_played: number
  score: number
  par: number
  is_competitive: boolean
  breakdown_tags: string[] | null
  course_rating: number | null
  slope_rating: number | null
  differential: number | null
  penalties: number | null
  fairways_pct: number | null
  gir_pct: number | null
  total_putts: number | null
  three_putts: number | null
  up_and_downs: number | null
  miss_left_pct: number | null
  miss_right_pct: number | null
  notes: string | null
  handicap_index: number | null   // golfer's tracked index at the time this round was saved
  is_9_hole: boolean              // derived from holes_played, kept only for convenient filtering
  created_at: string
  // WHS scoring (lib/handicap.ts, filled in by syncCalculatedHandicap). Absent until migration 0001 has run.
  adjusted_score?: number | null  // after net double bogey / par + 5; null for score-only rounds
  score_cap?: 'net_double_bogey' | 'par_plus_5' | 'approximate' | 'none' | null
  differential_status?: 'rated' | 'waiting_for_index' | 'no_rating' | 'too_short' | null
  course_id?: string | null       // OpenGolfAPI course id, when picked from search
  tee_name?: string | null
}

export type SgCategory = 'off_tee' | 'approach' | 'short_game' | 'putting'

// Curated shared catalog (drill_library).
type PracticeCategory = 'lag_putting' | 'short_putting' | 'short_game' | 'wedges' | 'approach' | 'tee' | 'warmup' | 'closeout'
type DrillLocation = 'home_net' | 'short_game_area' | 'range' | 'course' | 'simulator' | 'putting_green'
export type DrillDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface LibraryDrill {
  id: string
  name: string
  category: SgCategory
  description: string | null
  target_area: string | null
  difficulty: DrillDifficulty
  reps_suggested: number | null
  time_estimate_mins: number | null
  instructions: string | null
  equipment_needed: string | null
  practice_category: PracticeCategory | null
  locations: DrillLocation[]
  equipment: string | null
  structure: 'blocked' | 'blocked_serial_random' | 'random' | null
  /** 0 none, 1 a score to beat, 2 a restart rule or stake. */
  pressure: 0 | 1 | 2
  metric: 'count_of_n' | 'streak' | 'strokes' | 'pct' | null
  lower_is_better: boolean
  sets: { label: string; setup: string; balls: number; club?: string }[]
  levels: { name: string; rule: string }[]
  /** External focus only: a target, ball flight or club. */
  cue: string | null
  routine_rule: string | null
  source_url: string | null
  status: 'active' | 'closed' | 'locked'
}

export type HandicapSource = 'manual' | 'calculated'

export interface HandicapEntry {
  id: string
  handicap_index: number
  source: HandicapSource
  calculation_date: string
  rounds_used: number | null
  notes: string | null
  /** Rule 5.9 reductions acting on a calculated index (0 or negative). Absent until migration 0001 has run. */
  esr_adjustment?: number | string | null
  /** Rule 5.8 cap applied to a calculated index. */
  cap_applied?: 'soft' | 'hard' | null
  created_at: string
}

export interface Milestone {
  id: string
  date: string
  label: string
  created_at: string
}
