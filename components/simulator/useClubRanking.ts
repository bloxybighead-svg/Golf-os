"use client"

// Runs the club ranking (each club at its own best aim) in a Web Worker,
// so the map stays smooth while hundreds of thousands of shots are
// simulated. The course map and bag are sent to the worker only when they
// change; ranking requests wait RANK_DEBOUNCE_MS after the ball or pin
// stops moving, and past rankings are cached (see rankKey). Without Worker
// support it falls back to ranking on the page itself.

import { useEffect, useMemo, useRef, useState } from "react"
import type { LatLng } from "@/lib/course/geo"
import type { StartLie } from "@/lib/course/cost"
import type { ClubShots, OptimizedClubPlan } from "@/lib/course/plan"
import type { Strategy } from "@/lib/course/strategy"
import {
  createRankHandler,
  LruCache,
  RANK_CACHE_SIZE,
  rankKey,
  type LieInputs,
  type RankMessage,
  type RankReply,
} from "@/lib/course/rankRequest"

/** Wait after the ball or pin moves before ranking, so a drag or a burst of GPS fixes ranks once. */
export const RANK_DEBOUNCE_MS = 250

export interface RankingRequest {
  holeId: string | null
  from: LatLng
  /** The heuristic aim (fairway middle or pin): the search centre when there's no hole line. */
  aim: LatLng
  pin: LatLng
  startLie: StartLie
  line: LatLng[] | null
  /** Handicap of the scoring baseline; null = PGA TOUR. */
  handicap: number | null
  /** Par mode's offline-spread multiplier (the golfer's on-course spread setting). */
  spread: number
  /** The hole's par and yardage: long holes look one shot ahead from the tee. */
  par: number | null
  yards: number | null
}

export interface ClubRanking {
  /** The latest PAR ranking (widened spread; kept while a new one is being worked out, so the table doesn't flash). */
  results: OptimizedClubPlan[] | null
  /** The GO FOR IT ranking (raw dispersion). It follows the Par one a moment later; null until it arrives. */
  goResults: OptimizedClubPlan[] | null
  /** The cache key `results` belong to: changes exactly when a new stance has been ranked. */
  key: string | null
  /** A newer ranking is on its way. */
  pending: boolean
  /** How long the last fresh Par ranking took inside the worker, milliseconds. */
  ms: number | null
  /** The same for the Go for it ranking. */
  goMs: number | null
}

/** What the page keeps per stance: Par first, Go for it once the worker gets to it. */
interface CachedRanking {
  par: OptimizedClubPlan[]
  go: OptimizedClubPlan[] | null
  ms: number | null
  goMs: number | null
}

const EMPTY: ClubRanking = { results: null, goResults: null, key: null, pending: false, ms: null, goMs: null }

/** A number that goes up every time `value` is a new object. */
function useVersion(value: unknown): number {
  const counter = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ++counter.current, [value])
}

export function useClubRanking(lieInputs: LieInputs | null, clubs: ClubShots[], request: RankingRequest | null): ClubRanking {
  const liesVersion = useVersion(lieInputs)
  const bagVersion = useVersion(clubs)
  const [state, setState] = useState<ClubRanking>(EMPTY)

  const cache = useRef(new LruCache<CachedRanking>(RANK_CACHE_SIZE))
  const worker = useRef<Worker | null>(null)
  const local = useRef<ReturnType<typeof createRankHandler> | null>(null)
  const sent = useRef({ lies: -1, bag: -1 })
  const lastId = useRef(0)
  const keyForId = useRef(new Map<number, string>())
  const goId = useRef(0) // the id of the Go for it request that follows the latest Par one

  // Latest values for the (debounced) request, without making them effect dependencies.
  const latest = useRef({ lieInputs, clubs, request, liesVersion, bagVersion })
  latest.current = { lieInputs, clubs, request, liesVersion, bagVersion }

  const requestGo = useRef((key: string) => {
    const { request: req, liesVersion: lv, bagVersion: bv } = latest.current
    if (!req) return
    const id = ++lastId.current
    goId.current = id
    keyForId.current.set(id, key)
    send({ type: "rank", id, liesVersion: lv, bagVersion: bv, ...req, strategy: "go" as Strategy })
  })

  const onReply = useRef((reply: RankReply) => {
    const key = keyForId.current.get(reply.id)
    keyForId.current.delete(reply.id)
    if (reply.id !== lastId.current || key === undefined) return // a newer request is on its way
    if (!reply.results) {
      setState((s) => ({ ...s, pending: false }))
      return
    }
    if (reply.strategy === "go") {
      const cached = cache.current.get(key)
      if (cached) cache.current.set(key, { ...cached, go: reply.results, goMs: reply.ms })
      setState((s) => (s.key === key ? { ...s, goResults: reply.results, goMs: reply.ms } : s))
      return
    }
    // Par (or the plain ranking, from a caller that doesn't name a strategy): show it now, then ask for Go for it.
    cache.current.set(key, { par: reply.results, go: null, ms: reply.ms, goMs: null })
    setState({ results: reply.results, goResults: null, key, pending: false, ms: reply.ms, goMs: null })
    requestGo.current(key)
  })

  useEffect(() => {
    let w: Worker | null = null
    try {
      w = new Worker(new URL("../../lib/course/plan.worker.ts", import.meta.url))
      w.onmessage = (e: MessageEvent<RankReply>) => onReply.current(e.data)
    } catch {
      w = null // no worker support: rank on the page instead
    }
    worker.current = w
    sent.current = { lies: -1, bag: -1 }
    return () => {
      w?.terminate()
      worker.current = null
    }
  }, [])

  function send(msg: RankMessage) {
    if (worker.current) {
      worker.current.postMessage(msg)
      return
    }
    local.current ??= createRankHandler()
    const reply = local.current(msg)
    if (reply) onReply.current(reply)
  }

  const key = request && lieInputs ? rankKey({ liesVersion, bagVersion, ...request }) : null

  useEffect(() => {
    if (!key) {
      setState(EMPTY)
      return
    }
    const hit = cache.current.get(key)
    if (hit) {
      lastId.current += 1 // anything still in flight is now out of date
      setState({ results: hit.par, goResults: hit.go, key, pending: false, ms: hit.ms, goMs: hit.goMs })
      if (!hit.go) requestGo.current(key) // the Go for it ranking hadn't arrived when this stance was left
      return
    }
    setState((s) => ({ ...s, pending: true }))
    const timer = setTimeout(() => {
      const { lieInputs: inputs, clubs: bag, request: req, liesVersion: lv, bagVersion: bv } = latest.current
      if (!inputs || !req) return
      if (sent.current.lies !== lv) {
        send({ type: "lies", version: lv, inputs })
        sent.current.lies = lv
      }
      if (sent.current.bag !== bv) {
        send({ type: "bag", version: bv, clubs: bag })
        sent.current.bag = bv
      }
      const id = ++lastId.current
      keyForId.current.set(id, key)
      send({ type: "rank", id, liesVersion: lv, bagVersion: bv, ...req, strategy: "par" as Strategy })
    }, RANK_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
