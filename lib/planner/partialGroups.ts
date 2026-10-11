// Groups a ranking for display: partial wedge swings sit under their full club.

import { parsePartial } from "@/lib/golfer/partials"

export interface PartialGroup<T> {
  row: T
  /** 1-based place in the whole ranking, partials included. */
  rank: number
  partials: { row: T; rank: number }[]
}

/** Ranked rows in ranking order, each full club carrying its partials. A partial whose full club is not ranked stays a row of its own. */
export function groupPartials<T extends { club: string }>(rows: readonly T[]): PartialGroup<T>[] {
  const groups = new Map<string, PartialGroup<T>>()
  const out: PartialGroup<T>[] = []
  rows.forEach((row, i) => {
    if (parsePartial(row.club) === null) {
      const g = { row, rank: i + 1, partials: [] }
      groups.set(row.club, g)
      out.push(g)
    }
  })
  rows.forEach((row, i) => {
    const p = parsePartial(row.club)
    if (p === null) return
    const parent = groups.get(p.club)
    if (parent) parent.partials.push({ row, rank: i + 1 })
    else out.push({ row, rank: i + 1, partials: [] })
  })
  return out
}
