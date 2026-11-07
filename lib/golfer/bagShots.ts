// The shots the Play planner plays each club with, built in one place so My bag
// can show the same numbers the planner decides from.

import { repairCarries } from "./carryOrder"
import type { ClubShots } from "@/lib/course/plan"
import { MAX_CARRY, MIN_CARRY } from "./baseline"
import { generateCustomGolferShots, type Tendency } from "./build"
import type { MyBag } from "./shotProfile"
import type { Club } from "./tables"

const HANDICAP_SHOTS_PER_CLUB = 1500

/** Plausible carries for the two clubs the setup screen asks for; a number outside is ignored, so a half-typed one doesn't warp the bag. Other clubs use the baseline's range. */
const TYPED_RANGE: Partial<Record<Club, readonly [number, number]>> = { Driver: [120, 380], "7-Iron": [60, 240] }

export function carryRange(club: Club): readonly [number, number] {
  return TYPED_RANGE[club] ?? [MIN_CARRY, MAX_CARRY]
}

/** The carry as a usable typed number for this club, or null when blank or out of range. */
export function validTypedCarry(club: Club, raw: unknown): number | null {
  const v = Number(raw)
  const [lo, hi] = carryRange(club)
  return Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : null
}

/**
 * Every carry the golfer typed that the planner will use: driver, 7-iron and the extra clubs. An extra that contradicts
 * the order of the bag (a 3-wood past the driver) is left out of the simulation only: it stays in storage untouched,
 * and You -> My bag lists it with a fix (carryOrder.ts).
 */
export function typedCarries(driverCarry: unknown, sevenIronCarry: unknown, extra: Partial<Record<Club, number>>): Partial<Record<Club, number>> {
  const d = validTypedCarry("Driver", driverCarry)
  const i7 = validTypedCarry("7-Iron", sevenIronCarry)
  const out: Partial<Record<Club, number>> = { ...repairCarries(d == null ? "" : String(d), i7 == null ? "" : String(i7), extra).extras }
  if (d != null) out.Driver = d
  if (i7 != null) out["7-Iron"] = i7
  return out
}

/** Thin clubs blend toward this handicap: the account's tracked or setup index, else the one on the device. */
export function blendHandicapFor(accountHandicap: number | null, deviceHandicap: number): number {
  return Math.round(accountHandicap ?? deviceHandicap)
}

export function meanCarry(shots: readonly { carryYds: number }[]): number {
  return shots.reduce((a, s) => a + s.carryYds, 0) / shots.length
}

/** A club the golfer gave a carry for plays at exactly that mean: its shots are scaled, carry and offline alike, so the miss angle is kept. */
function applyTypedCarries(clubs: ClubShots[], typed: Partial<Record<Club, number>>): ClubShots[] {
  return clubs.map((c) => {
    const target = typed[c.club as Club]
    if (target == null || c.shots.length === 0) return c
    const r = target / meanCarry(c.shots)
    return { club: c.club, shots: c.shots.map((s) => ({ carryYds: s.carryYds * r, offlineYds: s.offlineYds * r })) }
  })
}

/** FNV-1a: a stable 31-bit seed from text, so the same key always gives the same shots. */
export function stableSeed(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 0) & 0x7fffffff
}

/**
 * A handicap estimate's shots. Each club is generated on its own from a seed made of the stable key (course + hole +
 * ball position, "" when not given) and the club's name, so adding, removing or reordering clubs never changes
 * another club's shots. (They used to share one random stream sized by the bag, so every club's samples moved.)
 */
function handicapShots(handicap: number, typed: Partial<Record<Club, number>>, tendency: Tendency | undefined, bag: Club[], seedKey = ""): ClubShots[] {
  return bag.map((club) => ({
    club,
    shots: generateCustomGolferShots({ handicapIndex: handicap, knownCarries: typed, tendency }, HANDICAP_SHOTS_PER_CLUB, stableSeed(`${seedKey}|${club}`), [club]).map((s) => ({
      carryYds: s.carryYds,
      offlineYds: s.offlineYds,
    })),
  }))
}

/**
 * The full-swing shots for a bag: the golfer's own bag (My shots) when there is
 * one, else a handicap estimate, with every typed carry applied on top.
 */
export function fullBagShots(args: {
  myBag: MyBag | null
  handicap: number
  typed: Partial<Record<Club, number>>
  tendency?: Tendency
  bag: Club[]
  /** Course + hole + ball position: seeds each club's estimated shots (see handicapShots). */
  seedKey?: string
}): ClubShots[] {
  if (!args.myBag) return applyTypedCarries(handicapShots(args.handicap, args.typed, args.tendency, args.bag, args.seedKey), args.typed)
  // Shots the golfer hit outrank a typed number (generateMyBag already leaned thin clubs on it); only a club with no shots plays at exactly the typed carry.
  const noShots = (club: string) => args.myBag!.basis[club] === "estimated"
  return applyTypedCarries(args.myBag.clubs, Object.fromEntries(Object.entries(args.typed).filter(([c]) => noShots(c))))
}
