"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { DispersionCanvas } from "./DispersionCanvas"
import { makeFairwayPolygon } from "@/lib/dispersion/polygon"

export interface ClubOption {
  club: string
  meanCarryYds: number
}

export interface SimShot {
  club: string
  carryYds: number
  offlineYds: number
  isMishit: boolean
}

interface Props {
  clubs: ClubOption[]
  shots: SimShot[]
  golferName: string
}

export function SimulatorClient({ clubs, shots, golferName }: Props) {
  const [selectedClub, setSelectedClub] = useState(clubs[0]?.club ?? "")
  const [fairwayWidthYds, setFairwayWidthYds] = useState(30)

  const clubShots = useMemo(() => shots.filter((s) => s.club === selectedClub), [shots, selectedClub])
  const clubInfo = clubs.find((c) => c.club === selectedClub)

  const { fairway, minCarryYds, maxCarryYds, widthYds } = useMemo(() => {
    if (clubShots.length === 0 || !clubInfo) {
      return { fairway: [], minCarryYds: 0, maxCarryYds: 300, widthYds: 100 }
    }
    const observedCarries = clubShots.map((s) => s.carryYds)
    const minObservedCarry = Math.min(...observedCarries)
    const maxObservedCarry = Math.max(...observedCarries)
    const maxAbsOffline = Math.max(...clubShots.map((s) => Math.abs(s.offlineYds)))
    // Zoom the visible window to where the shots actually are, not always
    // from the literal tee -- for a 163y-average club, always starting at
    // 0 wastes most of the canvas on empty fairway above nothing.
    const carryPadding = Math.max((maxObservedCarry - minObservedCarry) * 0.15, clubInfo.meanCarryYds * 0.03)
    const minCarryYds = Math.max(0, minObservedCarry - carryPadding)
    const maxCarryYds = maxObservedCarry + carryPadding
    const endWidthYds = fairwayWidthYds * 1.4
    const widthYds = Math.max(endWidthYds + 20, maxAbsOffline * 2.3)
    const fairway = makeFairwayPolygon({
      startYds: 0,
      endYds: maxCarryYds,
      startWidthYds: fairwayWidthYds,
      endWidthYds,
    })
    return { fairway, minCarryYds, maxCarryYds, widthYds }
  }, [clubShots, clubInfo, fairwayWidthYds])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Shot Dispersion Simulator</h2>
          <p className="mt-0.5 text-xs text-[#6b7280]">
            {golferName}&rsquo;s calibrated profile &middot; {shots.length.toLocaleString()} simulated shots
          </p>
        </div>
        <div className="flex gap-4">
          <Link href="/simulator/custom" className="text-xs text-[#22c55e] hover:underline">
            Custom Golfer &rarr;
          </Link>
          <Link href="/simulator/compare" className="text-xs text-[#22c55e] hover:underline">
            Compare Golfers &rarr;
          </Link>
          <Link href="/simulator/tbox" className="text-xs text-[#22c55e] hover:underline">
            Tee Box Estimator &rarr;
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-6 rounded-xl border border-white/[0.06] bg-[#111111] p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[#6b7280]">Club</span>
          <select
            value={selectedClub}
            onChange={(e) => setSelectedClub(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-[#0a0a0a] px-3 py-1.5 text-sm text-white"
          >
            {clubs.map((c) => (
              <option key={c.club} value={c.club}>
                {c.club} ({c.meanCarryYds.toFixed(0)}y avg)
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[#6b7280]">
            Target width at tee: {fairwayWidthYds}y
          </span>
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
        <p className="text-sm text-[#6b7280]">No shots for this club.</p>
      )}
    </div>
  )
}
