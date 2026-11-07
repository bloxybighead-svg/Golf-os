// Fetches one course's OpenStreetMap geometry the way app/api/courses/geometry/route.ts does (boundary -> ways ->
// holes/features, coastline, boundary shape) and writes it to scripts/data/<slug>.json for sim-validate.ts.
// Data (c) OpenStreetMap contributors, ODbL. Usage: npm run sim:fetch -- <slug> <lat> <lng> "<name>"
import { writeFileSync } from "node:fs"
import {
  boundaryGeometryQuery, boundaryQuery, coastQuery, courseGeometryQuery, courseWayIdsQuery, parseBoundaries, parseBoundaryShape,
  parseCoast, parseOverpass, pickBoundary, radiusQuery, type OverpassElement,
} from "../lib/course/overpass"

const HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
async function run(q: string): Promise<OverpassElement[]> {
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const h of HOSTS) {
      try {
        const res = await fetch(h, { method: "POST", headers: { "User-Agent": "golf-os-capstone/0.1 (shot dispersion research project)", "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(q)}` })
        if (res.ok) {
          const json = await res.json()
          // A busy server answers 200 with an empty list and a runtime-error remark: that is not "nothing there".
          if (!/runtime error|timed out|out of memory/i.test(String(json.remark ?? ""))) return (json.elements ?? []) as OverpassElement[]
        }
      } catch { /* try the next */ }
    }
    await new Promise((r) => setTimeout(r, 4000))
  }
  throw new Error("overpass busy")
}

async function main() {
  const [slug, latS, lngS, name] = process.argv.slice(2)
  const lat = Number(latS), lng = Number(lngS)
  const chosen = pickBoundary(parseBoundaries(await run(boundaryQuery(lat, lng, 1000))), lat, lng, name)
  let g
  if (chosen) {
    const ids = (await run(courseWayIdsQuery(chosen))).filter((e) => e.type === "way").map((e) => e.id)
    if (ids.length) {
      g = parseOverpass(await run(courseGeometryQuery(ids)), "course-area")
      if (g.holes.length) {
        g.coast = parseCoast(await run(coastQuery(chosen.bounds)))
        g.boundary = parseBoundaryShape(await run(boundaryGeometryQuery(chosen)))
      }
    }
  }
  if (!g || !g.holes.length) g = parseOverpass(await run(radiusQuery(lat, lng, 900)), "radius")
  writeFileSync(`scripts/data/${slug}.json`, JSON.stringify({ name, lat, lng, geometry: g }))
  console.log(slug, "holes", g.holes.length, "features", g.features.length, "boundary", !!g.boundary, "scope", g.scope)
}
void main()
