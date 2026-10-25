// What to bring: each drill's equipment text read into items, merged by name, in a fixed order.

const CLUB = /\b(putter|driver|wedges?|irons?|woods?|hybrids?|clubs?)\b/
const COUNTED = /^(\d+)\s+(.+)$/

interface Item {
  name: string
  count: number | null
}

/** Clubs, then balls, tees, alignment sticks, then the rest. */
const rank = (name: string) => (CLUB.test(name) ? 0 : /^balls?$/.test(name) ? 1 : /^tees?$/.test(name) ? 2 : /^alignment sticks?$/.test(name) ? 3 : 4)

/** "Putter, balls, 10 tees": the same item named by several drills is listed once with the largest count. */
export function bringList(equipment: readonly string[]): string {
  const items = new Map<string, Item>()
  for (const text of equipment) {
    for (const part of text.split(",")) {
      const raw = part.trim().toLowerCase()
      const counted = COUNTED.exec(raw)
      const name = counted ? counted[2] : raw
      if (!name) continue
      const count = counted ? Number(counted[1]) : null
      const key = name.replace(/s$/, "")
      const seen = items.get(key)
      if (!seen) items.set(key, { name, count })
      else if (count != null && (seen.count == null || count > seen.count)) seen.count = count
    }
  }
  const text = [...items.values()]
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item.name) - rank(b.item.name) || a.i - b.i)
    .map(({ item }) => (item.count != null ? `${item.count} ${item.name}` : item.name))
    .join(", ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
