// One practice session from the week's checklist: hard rules first, then minutes by priority, then drills.
//
// Rules, in order: device cutoff, pain, day before a round, Club Work before a competitive round, unfamiliar
// course, playing that day, six days in a row. Then: warm-up 5-10%, close-out and logging 5 min each, putting
// at least 25%, no area over 40%, no block under 10 min. Only 'active' drills are ever used.

import type { LibraryDrill } from "@/lib/supabase/types"
import type { PracticeArea } from "./weakness"
import type { WeekItem } from "./week"

type DrillLocation = LibraryDrill["locations"][number]
type Category = NonNullable<LibraryDrill["practice_category"]>

/** 'pain' is the injury/pain flag. */
export type Energy = "ok" | "pain"

export interface NextRound {
  date: Date
  competitive: boolean
  courseKnown: boolean
}

/** One set the golfer did; a skipped set has no score. */
export interface HistorySet {
  drillId: string
  at: Date
  skipped: boolean
}

export interface SessionBlock {
  kind: "warmup" | "drill" | "club_work" | "pre_round" | "closeout"
  category: Category
  drillId: string
  name: string
  startsAt: Date
  minutes: number
  balls: number
  sets: LibraryDrill["sets"]
  routineRule: string | null
  cue: string | null
  metric: LibraryDrill["metric"]
  lowerIsBetter: boolean
  level: { index: number; name: string; rule: string } | null
}

export interface SessionPlan {
  /** An off day: no blocks, and a note says why. */
  off: boolean
  blocks: SessionBlock[]
  /** Minutes of the blocks, logging not counted. */
  practiceMinutes: number
  loggingMinutes: number
  /** When logging ends; null with no blocks. */
  endsAt: Date | null
  notes: string[]
}

/** Logging ends by this clock time. From the spec: the 8:45 pm device cutoff. */
const CUTOFF_HOUR = 20
const CUTOFF_MINUTE = 45
const LOGGING_MIN = 5
const CLOSEOUT_MIN = 5
/** Warm-up share of the session. From the spec: 5-10%. ESTIMATE: the middle of that range. */
const WARMUP_SHARE = 0.075
const MIN_WARMUP_MIN = 5
const MAX_WARMUP_SHARE = 0.1
const PUTTING_MIN_SHARE = 0.25
const CATEGORY_MAX_SHARE = 0.4
const MIN_BLOCK_MIN = 10
const PAIN_MAX_MIN = 60
const DAY_BEFORE_MAX_MIN = 60
const PRE_ROUND_MIN = 25
const PRE_ROUND_MAX = 30
/** Extra weight on lag putting and approach before an unfamiliar course. From the spec: +50%. */
const UNFAMILIAR_WEIGHT = 1.5
/** Days of practice in a row after which the next is off. From the spec: the seventh. */
const OFF_AFTER_DAYS = 6
/** Club Work's minutes when the library has none for it. ESTIMATE. */
const CLUB_WORK_DEFAULT_MIN = 30
/** The pre-competition drill; the library marks it by this name. */
const CLUB_WORK = "Club Work"
const COMPETITIVE_WITHIN_DAYS = 3

const PUTTING_AREAS: readonly Category[] = ["lag_putting", "short_putting"]
const PAIN_CATEGORIES: ReadonlySet<Category> = new Set(["lag_putting", "short_putting", "short_game", "warmup", "closeout"])
const DAY_BEFORE_CATEGORIES: ReadonlySet<Category> = new Set(["lag_putting", "warmup", "closeout"])
const STRUCTURE_RANK = { blocked: 0, blocked_serial_random: 1, random: 2 } as const

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000)
const plusMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60_000)

function practiceDaysInARow(history: readonly HistorySet[], now: Date): number {
  const days = new Set(history.filter((s) => !s.skipped).map((s) => dayKey(s.at)))
  let n = 0
  for (let i = 1; days.has(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))); i++) n++
  return n
}

/** Largest-remainder rounding: whole minutes that add up to the rounded total. */
function wholeMinutes(shares: Map<Category, number>): Map<Category, number> {
  const total = Math.round([...shares.values()].reduce((a, b) => a + b, 0))
  const floors = [...shares].map(([k, v]) => ({ k, n: Math.floor(v), frac: v - Math.floor(v) }))
  let left = total - floors.reduce((s, f) => s + f.n, 0)
  for (const f of [...floors].sort((a, b) => b.frac - a.frac)) {
    if (left <= 0) break
    f.n += 1
    left -= 1
  }
  return new Map(floors.map((f) => [f.k, f.n]))
}

/**
 * Minutes per area in proportion to weight, no area above `capMin` (minus what it already holds), putting areas lifted
 * to `puttingNeed` minutes when they are short, and the smallest area under MIN_BLOCK_MIN dropped, its time shared out again.
 */
function allocate(weights: Map<Category, number>, total: number, held: Map<Category, number>, capMin: number, puttingNeed: number): Map<Category, number> {
  const areas = new Set(weights.keys())
  for (let round = 0; round < weights.size + 1; round++) {
    const shares = new Map<Category, number>()
    const open = new Set(areas)
    let left = total
    for (;;) {
      const sum = [...open].reduce((s, a) => s + (weights.get(a) as number), 0)
      const over = [...open].filter((a) => (left * (weights.get(a) as number)) / sum > capMin - (held.get(a) ?? 0))
      if (over.length === 0) break
      for (const a of over) {
        const room = Math.max(0, capMin - (held.get(a) ?? 0))
        shares.set(a, room)
        left -= room
        open.delete(a)
      }
      if (open.size === 0) break
    }
    const sum = [...open].reduce((s, a) => s + (weights.get(a) as number), 0)
    for (const a of open) shares.set(a, (left * (weights.get(a) as number)) / sum)

    // Putting at least its share: take the shortfall from the other areas pro rata and give it to putting by weight.
    const putting = [...shares].filter(([a]) => PUTTING_AREAS.includes(a))
    const other = [...shares].filter(([a]) => !PUTTING_AREAS.includes(a))
    const shortfall = puttingNeed - putting.reduce((s, [, v]) => s + v, 0)
    const otherTotal = other.reduce((s, [, v]) => s + v, 0)
    if (shortfall > 0 && putting.length > 0 && otherTotal > 0) {
      const moved = Math.min(shortfall, otherTotal)
      const pw = putting.reduce((s, [a]) => s + (weights.get(a) as number), 0)
      const adds = putting.map(([a, v]) => [a, Math.min((moved * (weights.get(a) as number)) / pw, Math.max(0, capMin - (held.get(a) ?? 0) - v))] as const)
      const actual = adds.reduce((s, [, x]) => s + x, 0)
      for (const [a, v] of other) shares.set(a, v - (actual * v) / otherTotal)
      for (const [a, x] of adds) shares.set(a, (shares.get(a) as number) + x)
    }

    // Drop the smallest block under the minimum and share its time out again, one at a time.
    const smallest = [...shares].sort((x, y) => x[1] - y[1])[0]
    if (!smallest || smallest[1] >= MIN_BLOCK_MIN) return wholeMinutes(shares)
    areas.delete(smallest[0])
    if (areas.size === 0) break
  }
  return new Map()
}

export function buildSession(args: {
  week: readonly WeekItem[]
  now: Date
  /** Practice minutes the golfer wants, logging not counted. */
  minutes: number
  location: DrillLocation
  energy: Energy
  nextRound: NextRound | null
  history: readonly HistorySet[]
  library: readonly LibraryDrill[]
  /** Current difficulty level per drill id (an index into the drill's levels); missing = 0. */
  levels: Readonly<Record<string, number>>
}): SessionPlan {
  const { now, location, energy, nextRound, history, library, levels } = args
  const notes: string[] = []
  const none = (note: string): SessionPlan => ({ off: false, blocks: [], practiceMinutes: 0, loggingMinutes: 0, endsAt: null, notes: [...notes, note] })

  if (practiceDaysInARow(history, now) >= OFF_AFTER_DAYS) {
    return { off: true, blocks: [], practiceMinutes: 0, loggingMinutes: 0, endsAt: null, notes: [`${OFF_AFTER_DAYS} practice days in a row: today is an off day.`] }
  }

  // a. Device cutoff: logging must end by 8:45 pm.
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), CUTOFF_HOUR, CUTOFF_MINUTE)
  const untilCutoff = Math.floor((cutoff.getTime() - now.getTime()) / 60_000) - LOGGING_MIN
  let cap = args.minutes
  if (untilCutoff < cap) {
    cap = Math.max(0, untilCutoff)
    notes.push(`Capped to ${cap} min so logging ends by 8:45 pm.`)
  }

  const daysToRound = nextRound ? daysBetween(now, nextRound.date) : null
  const playingToday = daysToRound === 0
  const dayBefore = daysToRound === 1
  const competitiveSoon = !!nextRound?.competitive && daysToRound != null && daysToRound >= 0 && daysToRound <= COMPETITIVE_WITHIN_DAYS

  // b. Pain: putting and chipping only, 60 min.
  if (energy === "pain") {
    cap = Math.min(cap, PAIN_MAX_MIN)
    notes.push("Pain flag: putting and chipping only, 60 min at most.")
  }
  // c. Day before a round: 60 min.
  if (dayBefore) {
    cap = Math.min(cap, DAY_BEFORE_MAX_MIN)
    notes.push("Day before a round: 60 min at most, lag speed and close-out only, nothing you have not scored before.")
  }
  // f. Playing that day: one pre-round block.
  if (playingToday) cap = Math.min(cap, PRE_ROUND_MAX)
  if (cap < MIN_BLOCK_MIN) return none("Not enough time for a block.")

  const scoredAt = new Map<string, number>()
  for (const s of history) if (!s.skipped) scoredAt.set(s.drillId, Math.max(scoredAt.get(s.drillId) ?? -Infinity, s.at.getTime()))

  const here = library.filter((d) => d.status === "active" && d.locations.includes(location) && d.practice_category != null && d.sets.length > 0)
  const allowed = energy === "pain" ? here.filter((d) => PAIN_CATEGORIES.has(d.practice_category as Category)) : here
  const pool = dayBefore ? allowed.filter((d) => DAY_BEFORE_CATEGORIES.has(d.practice_category as Category) && scoredAt.has(d.id)) : allowed

  const make = (d: LibraryDrill, kind: SessionBlock["kind"], startsAt: Date, minutes: number): SessionBlock => {
    const index = Math.min(Math.max(0, levels[d.id] ?? 0), Math.max(0, d.levels.length - 1))
    return {
      kind,
      category: d.practice_category as Category,
      drillId: d.id,
      name: d.name,
      startsAt,
      minutes,
      balls: d.sets.reduce((n, s) => n + s.balls, 0),
      sets: d.sets,
      routineRule: d.routine_rule,
      cue: d.cue,
      metric: d.metric,
      lowerIsBetter: d.lower_is_better,
      level: d.levels[index] ? { index, ...d.levels[index] } : null,
    }
  }
  const finish = (blocks: SessionBlock[]): SessionPlan => {
    const practiceMinutes = blocks.reduce((n, b) => n + b.minutes, 0)
    return { off: false, blocks, practiceMinutes, loggingMinutes: LOGGING_MIN, endsAt: plusMinutes(now, practiceMinutes + LOGGING_MIN), notes }
  }

  // d. Competitive round within 3 days: Club Work, even the day before (the one exception to "lag speed and close-out only").
  const clubWork = competitiveSoon ? allowed.find((d) => d.name === CLUB_WORK) : undefined
  if (competitiveSoon && !clubWork) notes.push("A competitive round is close: do Club Work at the range, home net or simulator.")

  const open = args.week.filter((w) => w.done < w.required)
  const weekItems = open.length > 0 ? open : args.week
  const priorityOf = (area: PracticeArea) => weekItems.find((w) => w.area === area)?.priority ?? 0

  // f. Playing that day: one block of 25-30 min.
  if (playingToday) {
    const minutes = cap >= PRE_ROUND_MIN ? Math.min(cap, PRE_ROUND_MAX) : cap
    const drill =
      clubWork ??
      [...pool].sort((a, b) => priorityOf(b.practice_category as PracticeArea) - priorityOf(a.practice_category as PracticeArea))[0]
    if (!drill) return none("No drill fits this location for a pre-round block.")
    return finish([make(drill, drill === clubWork ? "club_work" : "pre_round", now, minutes)])
  }

  const warmDrill = pool.find((d) => d.practice_category === "warmup")
  const closeDrill = pool.find((d) => d.practice_category === "closeout")
  const warm = warmDrill ? Math.min(Math.floor(cap * MAX_WARMUP_SHARE), Math.max(MIN_WARMUP_MIN, Math.round(cap * WARMUP_SHARE))) : 0
  const close = closeDrill ? CLOSEOUT_MIN : 0
  const clubMin = clubWork ? Math.min(clubWork.time_estimate_mins ?? CLUB_WORK_DEFAULT_MIN, cap - warm - close) : 0
  const free = cap - warm - close - clubMin

  // Areas with something to do here: the week's open items first, highest priority first.
  const lastDone = (d: LibraryDrill) => scoredAt.get(d.id) ?? -Infinity
  const areaDrills = (area: Category) =>
    pool.filter((d) => d.practice_category === area && d !== clubWork).sort((a, b) => lastDone(a) - lastDone(b) || a.name.localeCompare(b.name))
  const areas = (weekItems.length > 0 ? weekItems.map((w) => w.area) : (["lag_putting", "short_putting", "short_game", "wedges", "approach", "tee"] as PracticeArea[])).filter(
    (a) => areaDrills(a).length > 0
  )
  const weights = new Map<Category, number>()
  for (const a of areas) {
    const boost = nextRound && !nextRound.courseKnown && (a === "lag_putting" || a === "approach") ? UNFAMILIAR_WEIGHT : 1
    weights.set(a, priorityOf(a) * boost)
  }
  if ([...weights.values()].every((w) => w === 0)) for (const a of weights.keys()) weights.set(a, 1)

  const held = new Map<Category, number>(clubWork ? [["approach", clubMin]] : [])
  const puttingNeed = Math.max(0, cap * PUTTING_MIN_SHARE - warm - close)
  const minutesFor = free >= MIN_BLOCK_MIN && weights.size > 0 ? allocate(weights, free, held, cap * CATEGORY_MAX_SHARE, puttingNeed) : new Map<Category, number>()

  // Fill each area's minutes with its drills, longest-unscored first; a leftover under 10 min joins the last block.
  const drillBlocks: { drill: LibraryDrill; kind: SessionBlock["kind"]; minutes: number }[] = clubWork && clubMin > 0 ? [{ drill: clubWork, kind: "club_work", minutes: clubMin }] : []
  for (const [area, minutes] of minutesFor) {
    let left = minutes
    for (const d of areaDrills(area)) {
      if (left < MIN_BLOCK_MIN) break
      const est = d.time_estimate_mins ?? left
      const take = left - est < MIN_BLOCK_MIN ? left : est
      drillBlocks.push({ drill: d, kind: "drill", minutes: take })
      left -= take
    }
  }
  const rank = (d: LibraryDrill) => STRUCTURE_RANK[d.structure ?? "random"]
  const isPutting = (d: LibraryDrill) => PUTTING_AREAS.includes(d.practice_category as Category)
  const ordered = [...drillBlocks].sort((a, b) => Number(isPutting(b.drill)) - Number(isPutting(a.drill)) || rank(a.drill) - rank(b.drill))
  const sequence = [
    ...(warmDrill && warm > 0 ? [{ drill: warmDrill, kind: "warmup" as const, minutes: warm }] : []),
    ...ordered,
    ...(closeDrill && close > 0 ? [{ drill: closeDrill, kind: "closeout" as const, minutes: close }] : []),
  ]

  let clock = now
  const blocks = sequence.map((b) => {
    const block = make(b.drill, b.kind, clock, b.minutes)
    clock = plusMinutes(clock, b.minutes)
    return block
  })
  return blocks.length > 0 ? finish(blocks) : none("No drill fits this location.")
}
