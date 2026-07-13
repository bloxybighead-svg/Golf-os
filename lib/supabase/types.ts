export type BlockType = 'Full Swing' | 'Wedge/Scoring Zone' | 'Chipping' | 'Bunker' | 'Putting'
export type SessionType = 'Full Swing Focus' | 'Wedge Focus' | 'Short Game Focus' | 'Putting Focus' | 'Mixed'
export type Location =
  | 'Range (Colts Neck grass)'
  | 'Short Game Area'
  | 'Putting Green'
  | 'On-Course Practice'
  | 'Net (Home)'
export type DrillCategory = 'Full Swing' | 'Wedge' | 'Chipping' | 'Bunker' | 'Putting' | 'Mental'

export interface Drill {
  id: string
  name: string
  category: DrillCategory
  description: string | null
  target_metric: string | null
}

export interface BlockActivity {
  drill_id: string | null
  drill_name: string        // denormalized so cards don't need a lookup
  rep_count: number | null
  note: string | null
}

export interface SessionBlock {
  block_type: BlockType
  duration_minutes: number | null
  activities: BlockActivity[]
  clubs_used: string[]
  shot_count: number | null
  distance_range: string | null
  launch_pro: boolean
  quality_rating: number | null
  notes: string | null
}

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
  created_at: string
}

// Canonical swing-feel labels — single source for the Club Work dropdown
// and the Wedge Numbers derivation. Don't define feel lists anywhere else.
export const FEEL_LABELS = ['Full', '3/4', 'Half', 'Knockdown'] as const
export type FeelLabel = (typeof FEEL_LABELS)[number]

export interface ClubWorkEntry {
  club: string
  feel?: string | null        // optional; absent on entries logged before feels existed
  shots: number | null
  avg_carry: number | null
  dispersion: number | null   // ± yds carry spread (long/short of avg carry)
  offline_var?: number | null // ± yds offline (left/right of target line); absent on older entries
  spin_var: number | null     // ± rpm relative to baseline
  notes: string | null
}

export const CLUB_WORK_CLUBS = [
  "Driver", "3W", "7W", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "SM10 56°", "SM10 60°",
] as const

export interface Milestone {
  id: string
  date: string
  label: string
  created_at: string
}

export interface PracticeSession {
  id: string
  date: string
  start_time: string | null
  duration_minutes: number | null
  location: Location[]
  session_type: SessionType
  primary_goal: string | null
  overall_feel: number | null
  energy_level: number | null
  notes: string | null
  club_work: ClubWorkEntry[]
  created_at: string
}
