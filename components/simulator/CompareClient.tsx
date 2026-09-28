"use client"

import { useMemo, useState } from "react"
import { OverlayCanvas, type OverlaySeries } from "./OverlayCanvas"
import { computeDispersionStats, seededSample, type DispersionStats } from "@/lib/dispersion/stats"
import { GitCompare } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import { useThemeColor } from "@/lib/theme/tokens"

export interface GolferOption {
  key: string // `${golferName}::${sourceLabel}`
  golferName: string
  sourceLabel: string
  clubs: { club: string; meanCarryYds: number }[]
}

export interface CompareShot {
  golferKey: string
  club: string
  carryYds: number
  offlineYds: number
  isMishit: boolean
}

export interface RealShot {
  golferName: string
  club: string
  carryYds: number
  offlineYds: number
}

interface Props {
  golfers: GolferOption[]
  shots: CompareShot[]
  realShots: RealShot[]
}

const SAMPLE_SIZES = [500, 1000, 2000] as const

function StatsRow({ label, color, stats }: { label: string; color: string; stats: DispersionStats | null }) {
  if (!stats) return null
  return (
    <tr className="border-b border-fg/[0.04]">
      <td className="px-3 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-fg">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
      </td>
      <td className="px-3 py-1.5 text-fg-2">{stats.n}</td>
      <td className="px-3 py-1.5 text-fg-2">{stats.carryMean.toFixed(1)}</td>
      <td className="px-3 py-1.5 text-fg-2">{stats.carrySd.toFixed(1)}</td>
      <td className="px-3 py-1.5 text-fg-2">{stats.carryP10.toFixed(1)}</td>
      <td className="px-3 py-1.5 text-fg-2">{stats.carryP90.toFixed(1)}</td>
      <td className="px-3 py-1.5 text-fg-2">{stats.offlineSd.toFixed(1)}</td>
    </tr>
  )
}

export function CompareClient({ golfers, shots, realShots }: Props) {
  const c = useThemeColor()
  const COLOR_A = c("viz-blue")
  const COLOR_B = c("viz-orange")
  const COLOR_REAL = c("viz-yellow")
  const defaultA = golfers.find((g) => g.golferName === "Dillon Cady") ?? golfers[0]
  const defaultB = golfers.find((g) => g.key !== defaultA?.key) ?? golfers[0]

  const [golferAKey, setGolferAKey] = useState(defaultA?.key ?? "")
  const [golferBKey, setGolferBKey] = useState(defaultB?.key ?? "")
  const [sampleSize, setSampleSize] = useState<(typeof SAMPLE_SIZES)[number]>(2000)
  const [showRealShots, setShowRealShots] = useState(true)

  const golferA = golfers.find((g) => g.key === golferAKey)
  const golferB = golfers.find((g) => g.key === golferBKey)

  const commonClubs = useMemo(() => {
    if (!golferA || !golferB) return []
    const bClubs = new Set(golferB.clubs.map((c) => c.club))
    return golferA.clubs.filter((c) => bClubs.has(c.club)).sort((a, b) => b.meanCarryYds - a.meanCarryYds)
  }, [golferA, golferB])

  const [selectedClub, setSelectedClub] = useState(commonClubs[0]?.club ?? "")
  const club = commonClubs.some((c) => c.club === selectedClub) ? selectedClub : commonClubs[0]?.club ?? ""

  const shotsFor = (golferKey: string, clubName: string) =>
    shots.filter((s) => s.golferKey === golferKey && s.club === clubName)

  const allA = golferA ? shotsFor(golferA.key, club) : []
  const allB = golferB ? shotsFor(golferB.key, club) : []
  const sampledA = useMemo(() => seededSample(allA, sampleSize, 1), [allA, sampleSize])
  const sampledB = useMemo(() => seededSample(allB, sampleSize, 2), [allB, sampleSize])

  const dillonHasReal =
    (golferA?.golferName === "Dillon Cady" || golferB?.golferName === "Dillon Cady") &&
    realShots.some((r) => r.golferName === "Dillon Cady" && r.club === club)
  const realForClub = realShots.filter((r) => r.golferName === "Dillon Cady" && r.club === club)

  const series: OverlaySeries[] = []
  if (golferA) series.push({ key: "A", label: `${golferA.golferName} (${golferA.sourceLabel})`, color: COLOR_A, shots: sampledA })
  if (golferB) series.push({ key: "B", label: `${golferB.golferName} (${golferB.sourceLabel})`, color: COLOR_B, shots: sampledB })
  if (showRealShots && dillonHasReal) {
    series.push({ key: "real", label: "Dillon (real shots)", color: COLOR_REAL, shots: realForClub, markerShape: "cross", markerRadius: 3.5 })
  }

  const allVisiblePoints = series.flatMap((s) => s.shots)
  // Zoom the window to where the shots actually are (same fix as the
  // single-golfer simulator) instead of always starting at the tee.
  const minCarryYds =
    allVisiblePoints.length > 0
      ? Math.max(0, Math.min(...allVisiblePoints.map((s) => s.carryYds)) * 0.97)
      : 0
  const maxCarryYds = allVisiblePoints.length > 0 ? Math.max(...allVisiblePoints.map((s) => s.carryYds)) * 1.03 : 300
  const maxAbsOffline = allVisiblePoints.length > 0 ? Math.max(...allVisiblePoints.map((s) => Math.abs(s.offlineYds))) : 30
  const widthYds = Math.max(60, maxAbsOffline * 2.3)

  const statsA = allA.length > 0 ? computeDispersionStats(sampledA) : null
  const statsB = allB.length > 0 ? computeDispersionStats(sampledB) : null
  const statsReal = realForClub.length > 0 ? computeDispersionStats(realForClub) : null

  // Convergence: recompute at each fixed sample size (not gated by the
  // radio above) so the "how does this change as N grows" question has a
  // direct numeric answer instead of requiring the user to click through.
  const convergenceRows = golferA
    ? SAMPLE_SIZES.map((n) => ({ n, stats: computeDispersionStats(seededSample(allA, n, 1)) }))
    : []

  return (
    <div className="space-y-6">
      <PageHeader icon={GitCompare} title="Compare" subtitle={<>Two golfers&rsquo; shots on one chart, plus your real ones.</>} />

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-fg/[0.06] bg-surface p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Golfer A</span>
          <select
            value={golferAKey}
            onChange={(e) => setGolferAKey(e.target.value)}
            className="rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
          >
            {golfers.map((g) => (
              <option key={g.key} value={g.key}>
                {g.golferName} ({g.sourceLabel})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Golfer B</span>
          <select
            value={golferBKey}
            onChange={(e) => setGolferBKey(e.target.value)}
            className="rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
          >
            {golfers.map((g) => (
              <option key={g.key} value={g.key}>
                {g.golferName} ({g.sourceLabel})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Club (clubs both golfers share)</span>
          <select
            value={club}
            onChange={(e) => setSelectedClub(e.target.value)}
            className="rounded-lg border border-fg/[0.08] bg-page px-3 py-1.5 text-sm text-fg"
          >
            {commonClubs.map((c) => (
              <option key={c.club} value={c.club}>
                {c.club}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Simulated shots to show</span>
          <div className="flex gap-3">
            {SAMPLE_SIZES.map((n) => (
              <label key={n} className="flex items-center gap-1.5 text-sm text-fg-2">
                <input type="radio" checked={sampleSize === n} onChange={() => setSampleSize(n)} />
                {n}
              </label>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-fg-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={showRealShots}
            onChange={(e) => setShowRealShots(e.target.checked)}
            disabled={!dillonHasReal}
          />
          Show Dillon&rsquo;s real shots for this club
          {!dillonHasReal && <span className="text-muted">(no real data for this club/golfer combo)</span>}
        </label>
      </div>

      {commonClubs.length === 0 ? (
        <p className="text-sm text-muted">These two golfers have no clubs in common (naming mismatch or no overlap).</p>
      ) : (
        <>
          <OverlayCanvas series={series} minCarryYds={minCarryYds} maxCarryYds={maxCarryYds} widthYds={widthYds} />

          <div className="overflow-x-auto rounded-xl border border-fg/[0.06] bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-fg/[0.06] text-xs text-muted">
                  <th className="px-3 py-2">Golfer</th>
                  <th className="px-3 py-2">n</th>
                  <th className="px-3 py-2">Carry mean</th>
                  <th className="px-3 py-2">Carry SD</th>
                  <th className="px-3 py-2">Carry P10</th>
                  <th className="px-3 py-2">Carry P90</th>
                  <th className="px-3 py-2">Offline SD</th>
                </tr>
              </thead>
              <tbody>
                <StatsRow label={golferA ? `${golferA.golferName} (${golferA.sourceLabel})` : "A"} color={COLOR_A} stats={statsA} />
                <StatsRow label={golferB ? `${golferB.golferName} (${golferB.sourceLabel})` : "B"} color={COLOR_B} stats={statsB} />
                {showRealShots && dillonHasReal && <StatsRow label="Dillon (real)" color={COLOR_REAL} stats={statsReal} />}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted">
              How {golferA?.golferName ?? "Golfer A"}&rsquo;s {club} stats stabilize as sample size grows:
            </p>
            <div className="overflow-x-auto rounded-xl border border-fg/[0.06] bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-fg/[0.06] text-xs text-muted">
                    <th className="px-3 py-2">n shots</th>
                    <th className="px-3 py-2">Carry mean</th>
                    <th className="px-3 py-2">Carry SD</th>
                    <th className="px-3 py-2">Offline SD</th>
                  </tr>
                </thead>
                <tbody>
                  {convergenceRows.map(({ n, stats }) => (
                    <tr key={n} className="border-b border-fg/[0.04]">
                      <td className="px-3 py-1.5 text-fg">{n}</td>
                      <td className="px-3 py-1.5 text-fg-2">{stats.carryMean.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-fg-2">{stats.carrySd.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-fg-2">{stats.offlineSd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Each row resamples from the same underlying pool, so the drift you see is pure sampling noise.
              Expect it to shrink as n grows, not to represent a real change in the golfer over time.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
