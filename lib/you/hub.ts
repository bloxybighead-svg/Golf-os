// What the You hub shows beside each row. No math lives in the components.

/** A handicap index as golfers write it: plus handicaps get a "+". */
export function formatIndex(n: number): string {
  return n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1)
}

/** "2.4 index", or null when there is no index yet. */
export function statsValue(index: number | null): string | null {
  return index == null ? null : `${formatIndex(index)} index`
}

/** Where Edit/Save may send the golfer back to: an in-app path only. */
export function safeReturnPath(raw: string | null | undefined, fallback = "/you/bag"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback
  return raw
}
