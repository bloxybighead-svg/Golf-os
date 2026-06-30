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

export interface Round {
  id: string
  date: string
  course_name: string
  score: number
  par: number
  fairways_hit: number | null
  fairways_total: number | null
  gir: number | null
  total_putts: number | null
  notes: string | null
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
  created_at: string
}
