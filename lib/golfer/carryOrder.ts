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

export interface CarryConflict {
  club: Club
  carry: number
  /** The club it contradicts, and that club's carry. */
  against: Club
  againstCarry: number
  text: string
}

/**
 * Why each excluded extra was excluded, in words: "3-Wood (240) is longer than Driver (230)". Read-only: nothing is
 * removed from storage. The golfer's one-tap fix clears that club's number (it is then gapped like any other).
 */
export function carryConflicts(driver: string, sevenIron: string, extras: Partial<Record<Club, number>>): CarryConflict[] {
  const { extras: kept, dropped } = repairCarries(driver, sevenIron, extras)
  const main = cleanCarries({ Driver: driver || undefined, "7-Iron": sevenIron || undefined })
  const order = (c: Club) => BAG_ORDER.indexOf(c)
  const trusted = { ...kept, ...main } as Partial<Record<Club, number>>
  return dropped.map((club) => {
    const carry = extras[club]!
    // The anchor it contradicts, else the nearest longer club it is not shorter than.
    const clash = (Object.entries(trusted) as [Club, number][])
      .filter(([c, n]) => (order(c) < order(club) ? n <= carry : order(c) > order(club) ? n >= carry : false))
      .sort((a, b) => Math.abs(order(a[0]) - order(club)) - Math.abs(order(b[0]) - order(club)))[0]
    const [against, againstCarry] = clash ?? ["Driver" as Club, carry]
    const longer = order(against) < order(club)
    const how = longer ? (carry > againstCarry ? "longer than" : "the same as") : carry < againstCarry ? "shorter than" : "the same as"
    return { club, carry, against, againstCarry, text: `${club} (${carry}) is ${how} ${against} (${againstCarry})` }
  })
}
