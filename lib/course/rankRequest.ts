// The club ranking's message protocol, shared by the Web Worker
// (plan.worker.ts) and the page. The course map and the bag are sent only
// when they change (each with a version number); a ranking request then
// names the versions it was made for, so a reply can never mix a new ball
// position with an old map. Kept free of any worker API so tests (and a
// browser without workers) can run it directly.

import type { LatLng } from "./geo"
import { buildLieMap, type LieMap, type LieMapExtras, type UserZone } from "./lies"
import type { StartLie } from "./cost"
import type { CourseFeature } from "./overpass"
import { rankClubsOptimized, type ClubShots, type OptimizedClubPlan, type RankOptions } from "./plan"
import { getBaseline } from "./baseline"

/** Everything buildLieMap needs, as plain data that survives postMessage. */
export interface LieInputs {
  origin: LatLng
  features: CourseFeature[]
  coast: LatLng[][]
  zones: UserZone[]
  extras: Omit<LieMapExtras, "index">
}

export type RankMessage =
  | { type: "lies"; version: number; inputs: LieInputs }
  | { type: "bag"; version: number; clubs: ClubShots[] }
  | {
      type: "rank"
      id: number
      liesVersion: number
      bagVersion: number
      from: LatLng
      aim: LatLng
      pin: LatLng
      startLie: StartLie
      line: LatLng[] | null
      /** Handicap of the baseline to score against; null or absent = PGA TOUR. */
      handicap?: number | null
      opts?: Omit<RankOptions, "line">
    }

export interface RankReply {
  id: number
  /** Null when the handler didn't have the map or bag version the request named. */
  results: OptimizedClubPlan[] | null
  /** How long the ranking took, milliseconds. */
  ms: number
}

/** How many past rankings the page keeps (e.g. flipping back to a hole, or undoing a ball move). */
export const RANK_CACHE_SIZE = 20

/**
 * What a ranking depends on: the map and bag versions, the hole, the lie the
 * ball sits on, where the ball and pin are, and the baseline. Not the aim marker: each club
 * finds its own aim, so dragging the marker never needs a re-rank.
 */
export function rankKey(k: {
  liesVersion: number
  bagVersion: number
  holeId: string | null
  startLie: StartLie
  from: LatLng
  pin: LatLng
  /** The baseline's handicap (null = PGA TOUR). */
  handicap?: number | null
}): string {
  const pt = (p: LatLng) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`
  return [k.liesVersion, k.bagVersion, k.holeId ?? "-", k.startLie, pt(k.from), pt(k.pin), k.handicap ?? "tour"].join("|")
}

/** A small least-recently-used cache. */
export class LruCache<V> {
  private readonly map = new Map<string, V>()

  constructor(private readonly size: number) {}

  get(key: string): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }

  set(key: string, value: V): void {
    this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.size) this.map.delete(this.map.keys().next().value as string)
  }
}

export function buildLieMapFrom(inputs: LieInputs): LieMap {
  return buildLieMap(inputs.origin, inputs.features, inputs.coast, inputs.zones, inputs.extras)
}

/** A stateful handler: remembers the latest map and bag, answers "rank" messages. */
export function createRankHandler(now: () => number = () => performance.now()) {
  let lies: { version: number; map: LieMap } | null = null
  let bag: { version: number; clubs: ClubShots[] } | null = null

  return function handle(msg: RankMessage): RankReply | null {
    if (msg.type === "lies") {
      lies = { version: msg.version, map: buildLieMapFrom(msg.inputs) }
      return null
    }
    if (msg.type === "bag") {
      bag = { version: msg.version, clubs: msg.clubs }
      return null
    }
    if (!lies || !bag || lies.version !== msg.liesVersion || bag.version !== msg.bagVersion) {
      return { id: msg.id, results: null, ms: 0 }
    }
    const t0 = now()
    const results = rankClubsOptimized(
      bag.clubs,
      { from: msg.from, aim: msg.aim, pin: msg.pin, lies: lies.map, startLie: msg.startLie, baseline: getBaseline(msg.handicap ?? null) },
      { ...msg.opts, line: msg.line }
    )
    return { id: msg.id, results, ms: now() - t0 }
  }
}
