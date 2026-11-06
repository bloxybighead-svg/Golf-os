// Saved carries that cannot all be true at once: a 3-wood that carries farther than the driver, an 8-iron farther than
// the 7-iron. They pile up when the golfer changes Driver or 7-iron later and an older extra carry stays behind.

import { cleanCarries } from "./baseline"
import { BAG_ORDER, type Club } from "./tables"

/** The two numbers every golfer gives first. They are the anchors: an extra carry that contradicts them is the stale one. */
const ANCHORS: readonly Club[] = ["Driver", "7-Iron"]

/**
 * Drops the extra carries that break "longer clubs carry farther": any that contradicts Driver or 7-Iron, then any that
 * is not shorter than the one before it. A dropped club is no longer an entered number: it is gapped from the ones
 * that stay (tables.ts scaleProfilesToCarries). `driver` and `sevenIron` are the typed strings (blank = not given).
 */
export function repairCarries(
  driver: string,
  sevenIron: string,
  extras: Partial<Record<Club, number>>
): { extras: Partial<Record<Club, number>>; dropped: Club[] } {
  const main = cleanCarries({ Driver: driver || undefined, "7-Iron": sevenIron || undefined })
  const anchors = BAG_ORDER.flatMap((club) => (ANCHORS.includes(club) && main[club] != null ? [{ club, carry: main[club]! }] : []))
  const order = (c: Club) => BAG_ORDER.indexOf(c)
  const kept: Partial<Record<Club, number>> = {}
  const dropped: Club[] = []
  const all: { club: Club; carry: number; anchor: boolean }[] = [
    ...anchors.map((a) => ({ ...a, anchor: true })),
    ...BAG_ORDER.flatMap((club) => (extras[club] != null && !ANCHORS.includes(club) ? [{ club, carry: extras[club]!, anchor: false }] : [])),
  ].sort((a, b) => order(a.club) - order(b.club))
  let last = Infinity
  for (const c of all) {
    const againstAnchor = anchors.some((a) => (order(a.club) < order(c.club) ? a.carry <= c.carry : order(a.club) > order(c.club) ? a.carry >= c.carry : false))
    if (!c.anchor && (againstAnchor || c.carry >= last)) {
      dropped.push(c.club)
      continue
    }
    if (!c.anchor) kept[c.club] = c.carry
    last = c.carry
  }
  return { extras: kept, dropped }
}
