import type { createClient } from "@/lib/supabase/server"
import { courseYardsFrom, holeYardsFrom, type Scorecard } from "@/lib/courses/scorecard"
import { fetchScorecard } from "@/lib/courses/fetchScorecard"
import { fromDbRow, ROUND_SHOT_COLUMNS, type RoundShot, type RoundShotRow } from "@/lib/rounds/shots"
import type { SgHoleRow, SgRound } from "@/lib/rounds/roundSg"

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Everything one round's strokes gained is worked out from, in a form that crosses to the browser (the comparison level lives there). */
export interface SgRoundData {
  /** For naming the round on screen. */
  meta: { date: string; courseName: string }
  round: SgRound
  holes: SgHoleRow[]
  /** The saved shots of the round's complete holes only. */
  shots: RoundShot[]
  /** Yards from the tee played, where the scorecard has them. */
  yards: { holes: Record<number, number>; course: number | null }
}

const ROUND_COLUMNS = "id, date, course_name, holes_played, fairways_pct, gir_pct, total_putts, three_putts, up_and_downs, course_id, tee_name"
const HOLE_COLUMNS = "round_id, hole_number, par, strokes, putts, fairway_hit, green_hit, penalty, penalty_shot, first_putt_ft, tracking, wedge_in_hand, easy_updown_missed"

type RoundRow = SgRound & { date: string; course_name: string; course_id: string | null; tee_name: string | null }
type HoleRowWithRound = SgHoleRow & { round_id: string }

/** The most recent `limit` rounds (all of them without one), newest first, with their holes, tracked shots and yardages. */
export async function loadSgData(supabase: Supabase, limit?: number, withHolesOnly = false): Promise<SgRoundData[]> {
  // The inner join keeps only rounds entered hole by hole (Tiger 5 has nothing to say about the others).
  let query = supabase
    .from("rounds")
    .select(withHolesOnly ? `${ROUND_COLUMNS}, round_holes!inner(hole_number)` : ROUND_COLUMNS)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
  if (limit) query = query.limit(limit)
  const rounds = ((await query).data ?? []) as unknown as RoundRow[]
  if (rounds.length === 0) return []
  const ids = rounds.map((r) => r.id)

  const holeRows = ((await supabase.from("round_holes").select(HOLE_COLUMNS).in("round_id", ids)).data ?? []) as unknown as HoleRowWithRound[]

  const completeRounds = ids.filter((id) => holeRows.some((h) => h.round_id === id && h.tracking === "complete"))
  const shotRows =
    completeRounds.length > 0
      ? (((await supabase.from("round_shots").select(`round_id, ${ROUND_SHOT_COLUMNS}`).in("round_id", completeRounds)).data ?? []) as unknown as (RoundShotRow & { round_id: string })[])
      : []

  const withHoles = rounds.filter((r) => r.course_id && holeRows.some((h) => h.round_id === r.id))
  const courseIds = [...new Set(withHoles.map((r) => r.course_id as string))]
  const cards = new Map<string, Scorecard | null>(await Promise.all(courseIds.map(async (id) => [id, await fetchScorecard(id)] as const)))

  return rounds.map((r) => {
    const card = r.course_id ? (cards.get(r.course_id) ?? null) : null
    const holes = holeRows.filter((h) => h.round_id === r.id)
    const yardsByHole: Record<number, number> = {}
    for (const h of holes) {
      const yds = holeYardsFrom(card, r.tee_name, h.hole_number)
      if (yds != null) yardsByHole[h.hole_number] = yds
    }
    return {
      meta: { date: r.date, courseName: r.course_name },
      round: { id: r.id, holes_played: r.holes_played, fairways_pct: r.fairways_pct, gir_pct: r.gir_pct, total_putts: r.total_putts, three_putts: r.three_putts, up_and_downs: r.up_and_downs },
      holes: holes.map(({ round_id: _id, ...h }) => h),
      shots: shotRows.filter((s) => s.round_id === r.id).map(fromDbRow),
      yards: { holes: yardsByHole, course: courseYardsFrom(card, r.tee_name) },
    }
  })
}
