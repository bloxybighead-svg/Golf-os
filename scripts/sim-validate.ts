// Simulator validation: plays full simulated tee shots on every par 4/5 of several well-mapped courses, for
// handicap-estimate bags, and prints the model's numbers next to published amateur benchmarks. It changes nothing in
// the model: each "ablation" flips one input (the spread, the boundary, buildings, unmapped ground, look-ahead) from
// out here, never by editing the planner.
//
// Run:  npm run sim:validate            (all variants)   |   SIM_VARIANTS=base npm run sim:validate   (just the base run)
// Course data: scripts/data/*.json -- OpenStreetMap geometry, (c) OpenStreetMap contributors, ODbL (fetch more with npm run sim:fetch).

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { DEFAULT_BAG } from "../lib/golfer/bag"
import { fullBagShots } from "../lib/golfer/bagShots"
import type { Club } from "../lib/golfer/tables"
import { getBaseline } from "../lib/course/baseline"
import { bearingDeg, lineLengthYds, pointAlongLine, type LatLng } from "../lib/course/geo"
import { buildElevationField } from "../lib/course/elevation"
import type { ShotConditions } from "../lib/course/playsLike"
import { buildLieMap, type LieMap } from "../lib/course/lies"
import { buildLookahead, longestTotalYds } from "../lib/course/lookahead"
import type { CourseGeometry } from "../lib/course/overpass"
import { simulateLandings, type ClubShots } from "../lib/course/plan"
import { optionsFor, rankWithSpread, smartRows, tieText } from "../lib/course/rankOptions"
import { needsLookahead, ON_COURSE_SPREAD, penaltyShare, smartRule, widenShots } from "../lib/course/strategy"
import { holePinFor } from "../lib/planner/geometry"

// ---- Variants (one switch each) --------------------------------------------

interface Variant {
  name: string
  spread: number
  boundary: boolean
  buildings: boolean
  roads: boolean
  unmapped: "rough" | "fairway"
  lookahead: boolean
}
const BASE: Variant = { name: "base", spread: ON_COURSE_SPREAD, boundary: true, buildings: true, roads: true, unmapped: "rough", lookahead: true }
const VARIANTS: Variant[] = [
  BASE,
  { ...BASE, name: "a: spread 1.0", spread: 1.0 },
  { ...BASE, name: "b1: no boundary OB", boundary: false },
  { ...BASE, name: "b2: no building OB", buildings: false },
  { ...BASE, name: "b3: no road OB", roads: false },
  { ...BASE, name: "c: unmapped = fairway", unmapped: "fairway" },
  { ...BASE, name: "d: no look-ahead", lookahead: false },
]
const HANDICAPS = [0, 5, 10, 15, 20]
const BAG: Club[] = DEFAULT_BAG

// ---- Courses -----------------------------------------------------------------

interface CourseFile { name: string; lat: number; lng: number; geometry: CourseGeometry }
const dir = "scripts/data"
const candidates: CourseFile[] = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")))

const inRing = (p: LatLng, ring: LatLng[]) => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside
  }
  return inside
}

/**
 * How a hole and a course are judged "well mapped" (printed for every candidate). OpenStreetMap rarely has a fairway
 * polygon for every hole, and an unmapped fairway reads as rough, which would make "fairway %" meaningless. So only holes
 * where a mapped fairway polygon contains some point of the centreline (sampled every 10 yd) AND a mapped green polygon
 * contains the line's end are played ("mapped holes"). A course is used when it has at least MIN_MAPPED_HOLES of them.
 * Whether it also has a course boundary is reported: without one, boundary OB cannot be tested there.
 */
const MIN_MAPPED_HOLES = 8
type Hole = CourseGeometry["holes"][number]

function mappedHoles(c: CourseFile): Hole[] {
  const g = c.geometry
  const rings = (kind: string) => g.features.filter((f) => f.kind === kind).map((f) => f.ring)
  const fairways = rings("fairway")
  const greens = rings("green")
  const along = (line: LatLng[]) => Array.from({ length: Math.floor(lineLengthYds(line) / 10) + 1 }, (_, i) => pointAlongLine(line, i * 10))
  return g.holes.filter(
    (h) =>
      (h.par === 4 || h.par === 5) &&
      h.line.length >= 2 &&
      along(h.line).some((p) => fairways.some((r) => inRing(p, r))) &&
      greens.some((r) => inRing(h.line[h.line.length - 1], r))
  )
}

function mapping(c: CourseFile) {
  const g = c.geometry
  const par45 = g.holes.filter((h) => h.par === 4 || h.par === 5).length
  const mapped = mappedHoles(c).length
  return { par45, mappedHoles: mapped, boundary: !!g.boundary, water: g.features.filter((f) => f.kind === "water").length, bunkers: g.features.filter((f) => f.kind === "bunker").length, wellMapped: mapped >= MIN_MAPPED_HOLES }
}

function liesFor(c: CourseFile, v: Variant): LieMap {
  const g = c.geometry
  const feats = g.features.filter((f) => v.buildings || f.kind !== "building")
  const lines = (g.lines ?? []).filter((l) => v.roads || l.kind !== "road")
  const base = buildLieMap({ lat: c.lat, lng: c.lng }, feats, g.coast ?? [], [], { boundary: v.boundary ? g.boundary : null, lines })
  if (v.unmapped === "rough") return base
  const asFairway = (p: LatLng) => {
    const k = base.classify(p)
    return k.source === "inferred" && k.lie === "rough" ? { lie: "fairway" as const, source: "inferred" as const } : k
  }
  return { classify: asFairway, lieAt: (p) => asFairway(p).lie }
}

// ---- One hole ----------------------------------------------------------------

type Cat = "Driver" | "wood" | "hybrid" | "iron" | "wedge"
const catOf = (club: string): Cat => (club === "Driver" ? "Driver" : /Wood/.test(club) ? "wood" : /Hybrid/.test(club) ? "hybrid" : /^(PW|GW|SW|LW)/.test(club) ? "wedge" : "iron")

export interface Tally {
  holes: number
  shots: number
  lie: Record<string, number>
  unmapped: number
  clubs: Record<Cat, number>
  /** Driver is Smart play's pick */
  ms: number
}
const blank = (): Tally => ({ holes: 0, shots: 0, lie: {}, unmapped: 0, clubs: { Driver: 0, wood: 0, hybrid: 0, iron: 0, wedge: 0 }, ms: 0 })

function playHole(c: CourseFile, hole: CourseGeometry["holes"][number], handicap: number, v: Variant, lies: LieMap, into: Tally) {
  const g = c.geometry
  const from = hole.line[0]
  const pin = holePinFor(hole, g.features)
  const shots: ClubShots[] = fullBagShots({ myBag: null, handicap, typed: {}, bag: BAG, seedKey: `${c.name}|${hole.ref ?? hole.id}|tee` })
  const baseline = getBaseline(handicap)
  const toPin = lineLengthYds(hole.line)
  const widened = shots.map((s) => widenShots(s, v.spread))
  const t0 = performance.now()
  const ranking = rankWithSpread(shots, { from, aim: pin, pin, lies, startLie: "tee", baseline }, {
    spread: v.spread,
    line: hole.line,
    smart: smartRule(),
    lookahead: v.lookahead && needsLookahead(toPin, longestTotalYds(widened, "tee")) ? (clubs) => buildLookahead({ clubs, from, pin, line: hole.line, lies, baseline }) : undefined,
  })
  into.ms += performance.now() - t0
  const options = optionsFor(ranking)
  if (!options) return
  into.clubs[catOf(options.safer.club)]++
  // The Driver, aimed where Smart play aims it, hit with the on-course spread: where do the shots end up?
  const driver = ranking.find((r) => r.club === "Driver")
  const dShots = widened.find((s) => s.club === "Driver")
  if (!driver || !dShots) return
  const bearing = driver.safe?.bearingDeg ?? driver.bearingDeg
  for (const l of simulateLandings("Driver", dShots.shots, from, bearing, lies)) {
    into.lie[l.lie] = (into.lie[l.lie] ?? 0) + 1
    if (l.lieSource === "inferred") into.unmapped++
    into.shots++
  }
  into.holes++
}

function merge(into: Tally, t: Tally) {
  into.holes += t.holes
  into.shots += t.shots
  into.unmapped += t.unmapped
  into.ms += t.ms
  for (const [k, n] of Object.entries(t.lie)) into.lie[k] = (into.lie[k] ?? 0) + n
  for (const k of Object.keys(t.clubs) as Cat[]) into.clubs[k] += t.clubs[k]
}

const pct = (n: number, d: number) => (d ? (100 * n) / d : 0)
const f1 = (x: number) => x.toFixed(1)
const penalty = (t: Tally) => pct((t.lie.oob ?? 0) + (t.lie.water ?? 0), t.shots)

// ---- Run ---------------------------------------------------------------------

const only = process.env.SIM_VARIANTS?.split(",")
const variants = VARIANTS.filter((v) => !only || only.includes(v.name) || only.includes(v.name.split(":")[0]))
const results: Record<string, Record<string, { all: Tally; par4u440: Tally; byCourse: Record<string, Tally> }>> = {}

console.log("# Course mapping (par 4/5 holes with a mapped fairway / green near the line)")
for (const c of candidates) console.log(`- ${c.name}: ${JSON.stringify(mapping(c))}`)
const courses = candidates.filter((c) => mapping(c).wellMapped)
console.log(`Used: ${courses.map((c) => c.name).join(", ")}`)

for (const v of variants) {
  results[v.name] = {}
  for (const hcp of HANDICAPS) {
    const all = blank()
    const short = blank()
    const byCourse: Record<string, Tally> = {}
    for (const c of courses) {
      const lies = liesFor(c, v)
      const mine = (byCourse[c.name] = blank())
      for (const hole of mappedHoles(c)) {
        playHole(c, hole, hcp, v, lies, mine)
        if (hole.par === 4 && lineLengthYds(hole.line) < 440) playHole(c, hole, hcp, v, lies, short)
      }
      merge(all, mine)
    }
    results[v.name][hcp] = { all, par4u440: short, byCourse }
    console.error(`${v.name} hcp ${hcp}: ${all.holes} holes, ${(all.ms / Math.max(1, all.holes)).toFixed(0)} ms/hole`)
  }
}

mkdirSync(".sim", { recursive: true })
writeFileSync(".sim/results.json", JSON.stringify(results, null, 1))

// ---- Report ------------------------------------------------------------------

const row = (t: Tally) =>
  `fairway ${f1(pct(t.lie.fairway ?? 0, t.shots))}% | penalty ${f1(penalty(t))}% (OB ${f1(pct(t.lie.oob ?? 0, t.shots))}, water ${f1(pct(t.lie.water ?? 0, t.shots))}) | rough ${f1(pct(t.lie.rough ?? 0, t.shots))} trees ${f1(pct(t.lie.trees ?? 0, t.shots))} bunker ${f1(pct(t.lie.bunker ?? 0, t.shots))} green ${f1(pct(t.lie.green ?? 0, t.shots))} | unmapped ${f1(pct(t.unmapped, t.shots))}%`
const picks = (t: Tally) => (["Driver", "wood", "hybrid", "iron", "wedge"] as Cat[]).map((k) => `${k} ${f1(pct(t.clubs[k], t.holes))}%`).join(", ")

for (const v of variants) {
  console.log(`\n## ${v.name}`)
  for (const hcp of HANDICAPS) {
    const { all, par4u440 } = results[v.name][hcp]
    console.log(`hcp ${String(hcp).padStart(2)} (${all.holes} holes, ${all.shots} drives): ${row(all)}`)
    for (const [name, t] of Object.entries(results[v.name][hcp].byCourse)) console.log(`        - ${name} (${t.holes} holes): fairway ${f1(pct(t.lie.fairway ?? 0, t.shots))}%, penalty ${f1(penalty(t))}%`)
    console.log(`        Smart-play pick: ${picks(all)}   | par 4 < 440 (${par4u440.holes} holes): ${picks(par4u440)}`)
  }
}

// ---- Pebble Beach hole 1, live card (the case that started this) ---------------
// 11 mph into, 59 F against carries measured at 70 F, 21 ft of climb: as in lib/course/regressionHarness.ts pebbleH1.

function h1Case(c: CourseFile, v: Variant, hcp: number) {
  const hole = c.geometry.holes.find((h) => h.ref === 1)!
  const lies = liesFor(c, v)
  const from = hole.line[0]
  const pin = holePinFor(hole, c.geometry.features)
  const total = lineLengthYds(hole.line)
  const conditions: ShotConditions = {
    wind: { speedMph: 11, fromDeg: bearingDeg(from, pin) },
    elevation: buildElevationField(Array.from({ length: 12 }, (_, i) => ({ ...pointAlongLine(hole.line, (total * i) / 11), ft: (21 * i) / 11 }))),
    temperatureF: 59,
    baselineF: 70,
  }
  const shots = fullBagShots({ myBag: null, handicap: hcp, typed: {}, bag: BAG, seedKey: `${c.name}|${hole.ref}|tee` })
  const baseline = getBaseline(hcp)
  const widened = shots.map((s) => widenShots(s, v.spread))
  const ranking = rankWithSpread(shots, { from, aim: pin, pin, lies, startLie: "tee", baseline, conditions }, {
    spread: v.spread,
    line: hole.line,
    smart: smartRule(),
    lookahead: v.lookahead && needsLookahead(lineLengthYds(hole.line), longestTotalYds(widened, "tee")) ? (clubs) => buildLookahead({ clubs, from, pin, line: hole.line, lies, baseline, conditions }) : undefined,
  })
  const o = optionsFor(ranking)!
  const d = ranking.find((r) => r.club === "Driver")!
  const dp = d.safe?.plan ?? d.plan
  // What the pick would be under other over-cap multipliers (offline arithmetic on the same rows; the constant is untouched).
  const rows = smartRows(ranking).map((r) => ({ club: r.club, st: r.plan.expectedStrokes, p: penaltyShare(r.plan) }))
  const pickAt = (m: number) => rows.reduce((a, b) => (b.st + 1.5 * (Math.min(b.p, 0.1) + m * Math.max(0, b.p - 0.1)) < a.st + 1.5 * (Math.min(a.p, 0.1) + m * Math.max(0, a.p - 0.1)) ? b : a)).club
  const mults = v.name === "base" ? ` | over-cap x1: ${pickAt(1)}, x2: ${pickAt(2)}, x3 (now): ${pickAt(3)}` : ""
  return `pick ${o.safer.club.padEnd(8)} (tied: ${o.tied.map((t) => t.club).join("/")}) | Driver pen ${f1(100 * penaltyShare(dp))}% strokes ${dp.expectedStrokes.toFixed(3)} | best strokes ${o.lowest.club} ${o.lowest.plan.expectedStrokes.toFixed(3)}${mults}`
}

const pebble = courses.find((c) => c.name.startsWith("Pebble"))
if (pebble?.geometry.holes.some((h) => h.ref === 1)) {
  console.log("\n## Pebble Beach hole 1, live card: Smart-play pick per variant")
  for (const v of variants) for (const hcp of [10, 18, 20]) console.log(`${v.name.padEnd(24)} hcp ${String(hcp).padStart(2)}: ${h1Case(pebble, v, hcp)}`)
}

// ---- Strokes-to-hole curve ---------------------------------------------------

console.log("\n## Expected strokes to hole out from the fairway (the model's baseline)")
const dists = [150, 175, 200, 225, 229, 250, 257, 275]
console.log("hcp  " + dists.map((d) => String(d).padStart(6)).join(""))
for (const hcp of HANDICAPS) console.log(String(hcp).padStart(3) + "  " + dists.map((d) => getBaseline(hcp).fairway(d).toFixed(2).padStart(6)).join(""))
