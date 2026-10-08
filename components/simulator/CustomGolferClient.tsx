"use client"

import { useMemo, useState } from "react"
import { DispersionCanvas } from "./DispersionCanvas"
import { makeFairwayPolygon } from "@/lib/dispersion/polygon"
import { generateCustomGolferShots } from "@/lib/golfer/build"
import { BAG_ORDER, type Club } from "@/lib/golfer/tables"
import type { Tendency } from "@/lib/golfer/build"
import { TendencyPicker } from "./TendencyPicker"
import { SlidersHorizontal } from "lucide-react"
import PageHeader from "@/components/PageHeader"

interface CarryRow {
  club: Club
  yards: number
}

export function CustomGolferClient() {
  const [handicapIndex, setHandicapIndex] = useState(10)
  const [tendency, setTendency] = useState<Tendency>({ side: "auto", strength: "moderate" })
  const [nShots, setNShots] = useState(1000)
  const [seed, setSeed] = useState(1)
  const [carryRows, setCarryRows] = useState<CarryRow[]>([{ club: "Driver", yards: 220 }])
  const [selectedClub, setSelectedClub] = useState<Club>("Driver")
  const [fairwayWidthYds, setFairwayWidthYds] = useState(30)
  const [generation, setGeneration] = useState(0) // bump to force regeneration

  const knownCarries = useMemo(() => {
    const map: Partial<Record<Club, number>> = {}
    for (const row of carryRows) map[row.club] = row.yards
    return map
  }, [carryRows])

  const shots = useMemo(() => {
    const _ = generation // dependency: regenerate only when the button is clicked
    return generateCustomGolferShots({ handicapIndex, knownCarries, tendency }, nShots, seed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation])

  const clubShots = useMemo(() => shots.filter((s) => s.club === selectedClub), [shots, selectedClub])
  const clubsInBag = useMemo(() => Array.from(new Set(shots.map((s) => s.club))), [shots])

  const { fairway, minCarryYds, maxCarryYds, widthYds } = useMemo(() => {
    if (clubShots.length === 0) return { fairway: [], minCarryYds: 0, maxCarryYds: 300, widthYds: 100 }
    const carries = clubShots.map((s) => s.carryYds)
    const minObserved = Math.min(...carries)
    const maxObserved = Math.max(...carries)
    const maxAbsOffline = Math.max(...clubShots.map((s) => Math.abs(s.offlineYds)))
    const meanCarry = carries.reduce((a, b) => a + b, 0) / carries.length
    const carryPadding = Math.max((maxObserved - minObserved) * 0.15, meanCarry * 0.03)
    const minCarryYds = Math.max(0, minObserved - carryPadding)
    const maxCarryYds = maxObserved + carryPadding
    const endWidthYds = fairwayWidthYds * 1.4
    const widthYds = Math.max(endWidthYds + 20, maxAbsOffline * 2.3)
    const fairway = makeFairwayPolygon({ startYds: 0, endYds: maxCarryYds, startWidthYds: fairwayWidthYds, endWidthYds })
    return { fairway, minCarryYds, maxCarryYds, widthYds }
  }, [clubShots, fairwayWidthYds])

  function updateRow(i: number, patch: Partial<CarryRow>) {
    setCarryRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    const used = new Set(carryRows.map((r) => r.club))
    const nextClub = BAG_ORDER.find((c) => !used.has(c)) ?? "Driver"
    setCarryRows((prev) => [...prev, { club: nextClub, yards: 150 }])
  }
  function removeRow(i: number) {
    setCarryRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-6">
      <PageHeader icon={SlidersHorizontal} title="What if" subtitle={<>A golfer built from a handicap and a couple of carries.</>} />

      <div className="space-y-4 rounded-xl border border-fg/[0.06] bg-surface p-4">
        <div className="flex flex-wrap gap-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Handicap Index</span>
            <input
              type="number"
              step={0.1}
              value={handicapIndex}
              onChange={(e) => setHandicapIndex(Number(e.target.value))}
              className="w-28 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Shots to generate</span>
            <input
              type="number"
              min={100}
              max={20000}
              step={100}
              value={nShots}
              onChange={(e) => setNShots(Number(e.target.value))}
              className="w-28 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
            />
          </label>
          <TendencyPicker value={tendency} onChange={setTendency} />
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Seed (optional)</span>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="w-28 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
            />
          </label>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted">
            Known carries (optional) &mdash; rescales the whole bag to your real numbers. Leave empty to use
            tier-average distances for this handicap.
          </p>
          <div className="space-y-2">
            {carryRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={row.club}
                  onChange={(e) => updateRow(i, { club: e.target.value as Club })}
                  className="rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
                >
                  {BAG_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted">=</span>
                <input
                  type="number"
                  value={row.yards}
                  onChange={(e) => updateRow(i, { yards: Number(e.target.value) })}
                  className="w-24 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
                />
                <span className="text-sm text-muted">yds</span>
                <button onClick={() => removeRow(i)} className="text-xs text-muted hover:text-danger">
                  remove
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addRow}
            className="mt-2 rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-xs text-fg-2 hover:border-accent/50"
          >
            + Add club
          </button>
        </div>

        <button
          onClick={() => setGeneration((g) => g + 1)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent shadow-md shadow-accent/20 transition-all hover:brightness-110 hover:scale-[1.03] active:scale-[0.97]"
        >
          Generate
        </button>
      </div>

      {shots.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-6 rounded-xl border border-fg/[0.06] bg-surface p-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Club to view</span>
              <select
                value={selectedClub}
                onChange={(e) => setSelectedClub(e.target.value as Club)}
                className="rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
              >
                {clubsInBag.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Target width at tee: {fairwayWidthYds}y</span>
              <input
                type="range"
                min={10}
                max={60}
                step={5}
                value={fairwayWidthYds}
                onChange={(e) => setFairwayWidthYds(Number(e.target.value))}
                className="w-48"
              />
            </label>
          </div>

          {clubShots.length > 0 ? (
            <DispersionCanvas
              shots={clubShots.map((s) => ({ carryYds: s.carryYds, offlineYds: s.offlineYds, isMishit: s.isMishit }))}
              fairway={fairway}
              minCarryYds={minCarryYds}
              maxCarryYds={maxCarryYds}
              widthYds={widthYds}
            />
          ) : (
            <p className="text-sm text-muted">No shots for this club.</p>
          )}
        </>
      )}
    </div>
  )
}
