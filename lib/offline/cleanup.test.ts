import { describe, expect, it } from "vitest"
import { cleanupLocalStorage, type KeyStore } from "./cleanup"
import { coursesToEvict, MAX_SAVED_COURSES } from "./snapshots"

function fakeStore(entries: Record<string, string>): KeyStore & { keys: () => string[] } {
  const m = new Map(Object.entries(entries))
  return {
    get length() {
      return m.size
    },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    removeItem: (k) => void m.delete(k),
    keys: () => Array.from(m.keys()).sort(),
  }
}

describe("localStorage cleanup", () => {
  it("deletes every golfos.course.* key (any version) and keeps other golfos.* keys", () => {
    const store = fakeStore({
      "golfos.course.abc.v3": "x",
      "golfos.course.abc.v4": "x",
      "golfos.course.def.v4": "x",
      "golfos.recentCourses.v1": "[]",
      "golfos.activeRound.v1": "{}",
      "golfos.windManual.v1": "{}",
      "other.key": "1",
    })
    const removed = cleanupLocalStorage(store, null)
    expect(removed.sort()).toEqual(["golfos.course.abc.v3", "golfos.course.abc.v4", "golfos.course.def.v4"])
    expect(store.keys()).toEqual(["golfos.activeRound.v1", "golfos.recentCourses.v1", "golfos.windManual.v1", "other.key"])
  })

  it("drops zoom for courses with no saved data, and empty zones, but never zones with drawings", () => {
    const store = fakeStore({
      "golfos.zoom.kept.v1": "17",
      "golfos.zoom.gone.v1": "17",
      "golfos.zones.gone.v1": "[]",
      "golfos.zones.drawn.v1": JSON.stringify([{ lie: "trees", ring: [] }]),
      "golfos.zones.broken.v1": "{not json",
      "golfos.zones.kept.v1": "[]",
    })
    cleanupLocalStorage(store, new Set(["kept"]))
    expect(store.keys()).toEqual(["golfos.zones.broken.v1", "golfos.zones.drawn.v1", "golfos.zones.kept.v1", "golfos.zoom.kept.v1"])
  })

  it("leaves zoom and zones alone when the saved courses are unknown", () => {
    const store = fakeStore({ "golfos.zoom.x.v1": "17", "golfos.zones.x.v1": "[]" })
    expect(cleanupLocalStorage(store, null)).toEqual([])
  })
})

describe("saved course eviction", () => {
  const course = (id: number, savedAt: number) => ({ key: `course:${id}`, savedAt })

  it("keeps at most 30", () => {
    expect(MAX_SAVED_COURSES).toBe(30)
    const courses = Array.from({ length: 35 }, (_, i) => course(i, 1000 + i))
    const evict = coursesToEvict(courses, new Map(), MAX_SAVED_COURSES)
    expect(evict).toHaveLength(5)
    expect(evict.sort()).toEqual([0, 1, 2, 3, 4].map((i) => `course:${i}`).sort())
  })

  it("nothing to delete at or under the limit", () => {
    expect(coursesToEvict(Array.from({ length: 30 }, (_, i) => course(i, i)), new Map(), 30)).toEqual([])
    expect(coursesToEvict([], new Map(), 30)).toEqual([])
  })

  it("an old course that was used recently survives; a newer one never used is evicted first", () => {
    const courses = [course(1, 100), course(2, 200), course(3, 300)]
    const used = new Map([["course:1", 900]])
    expect(coursesToEvict(courses, used, 2)).toEqual(["course:2"])
  })
})
