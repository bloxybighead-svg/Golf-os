// Turns the club labels launch monitors and people write ("7i", "7 Iron",
// "7-iron", "Pitching Wedge", "56°") into the catalog names in BAG_ORDER.

import { BAG_ORDER, type Club } from "./tables"

const WOODS: Record<string, Club> = { "1": "Driver", "3": "3-Wood", "5": "5-Wood", "7": "7-Wood" }

// A bare wedge loft ("56", "56°") -> the wedge it usually is. Lofts sit in
// bands, not exact numbers: a 52 is a gap wedge, a 58 is a sand wedge.
// Judgement values, not from a standard; the loft names vary by maker.
const LOFT_TO_WEDGE: [number, number, Club][] = [
  [44, 48, "PW"],
  [49, 53, "GW"],
  [54, 58, "SW"],
  [59, 64, "LW"],
]

/** The catalog club a label means, or null when it isn't one the planner knows (hybrids, putters, "Average"). */
export function normalizeClubName(raw: string): Club | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[°º]/g, "")
    .replace(/[\s_\-.]+/g, " ")
  if (!s) return null
  if ((BAG_ORDER as readonly string[]).map((c) => c.toLowerCase()).includes(s)) {
    return BAG_ORDER.find((c) => c.toLowerCase() === s) ?? null
  }

  if (/^(dr|driver|d|1 ?w|1 ?wood|wood 1)$/.test(s)) return "Driver"

  const wood = s.match(/^(\d) ?(w|wood)$/) ?? s.match(/^(?:fairway )?wood (\d)$/)
  if (wood) return WOODS[wood[1]] ?? null

  const iron = s.match(/^(\d) ?(i|iron)$/) ?? s.match(/^iron (\d)$/)
  if (iron) {
    const n = Number(iron[1])
    return n >= 4 && n <= 9 ? (`${n}-Iron` as Club) : null
  }

  if (/^(pw|p|pitching wedge|pitching)$/.test(s)) return "PW"
  if (/^(gw|aw|a|gap wedge|approach wedge|gap|approach|uw)$/.test(s)) return "GW"
  if (/^(sw|s|sand wedge|sand)$/.test(s)) return "SW"
  if (/^(lw|l|lob wedge|lob)$/.test(s)) return "LW"

  // "56 (SW)" -- the label this app's own data uses -- or a bare loft.
  const named = s.match(/\b(pw|gw|sw|lw)\b/)
  if (named) return named[1].toUpperCase() as Club
  const loft = s.match(/^(\d{2})( ?(deg|degree|degrees))?$/)
  if (loft) {
    const n = Number(loft[1])
    return LOFT_TO_WEDGE.find(([lo, hi]) => n >= lo && n <= hi)?.[2] ?? null
  }
  return null
}
