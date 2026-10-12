// What the You hub shows beside each row. No math lives in the components.

const DAY_MS = 24 * 60 * 60 * 1000
/** "This week" on the Practice row: the last 7 days, not the calendar week. */
export const PRACTICE_WINDOW_DAYS = 7

/** A handicap index as golfers write it: plus handicaps get a "+". */
export function formatIndex(n: number): string {
  return n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1)
}

/** "2.4 index", or null when there is no index yet. */
export function statsValue(index: number | null): string | null {
  return index == null ? null : `${formatIndex(index)} index`
}

/** Drills finished in the last 7 days (an unfinished drill doesn't count). */
export function drillsThisWeek(runs: readonly { completed_at: string | null }[], now: number): number {
  return runs.filter((r) => {
    if (!r.completed_at) return false
    const age = now - new Date(r.completed_at).getTime()
    return age >= 0 && age <= PRACTICE_WINDOW_DAYS * DAY_MS
  }).length
}

/** "3 drills this week", "1 drill this week", or null for none (the row then shows no number). */
export function practiceValue(count: number): string | null {
  if (count <= 0) return null
  return `${count} drill${count === 1 ? "" : "s"} this week`
}

/** Where Edit/Save may send the golfer back to: an in-app path only. */
export function safeReturnPath(raw: string | null | undefined, fallback = "/you/bag"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback
  return raw
}
