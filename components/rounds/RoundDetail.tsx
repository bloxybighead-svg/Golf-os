"use client"

// One round opened up: the scorecard, each hole's strokes gained and where it came from, and for holes
// tracked shot by shot the shot list and a small map.

import { useState } from "react"
import dynamic from "next/dynamic"
import { BottomSheet } from "@/components/play/BottomSheet"
import { distanceYds } from "@/lib/course/geo"
import { CATEGORY_LABEL } from "@/lib/drillRecommendations"
import { lieLabel } from "@/lib/rounds/shots"
import { formatSg as fmtSg, type RoundSgResult } from "@/lib/rounds/roundSg"
import type { SgRoundData } from "@/lib/supabase/loadSgData"
import type { Round } from "@/lib/supabase/types"

const ShotsMap = dynamic(() => import("@/components/rounds/ShotsMap"), {
  ssr: false,
  loading: () => <div className="flex h-56 items-center justify-center text-xs text-muted">Loading map…</div>,
})

const yesNo = (v: boolean | null) => (v == null ? "–" : v ? "Yes" : "No")

type Props = { round: Round; data: SgRoundData; sg: RoundSgResult; label: string }

export function RoundDetail({ onClose, ...props }: Props & { onClose: () => void }) {
  return (
    <BottomSheet label="Round detail" title={`${props.round.course_name} · ${props.round.score}`} onClose={onClose}>
      <RoundDetailBody {...props} />
    </BottomSheet>
  )
}

export function RoundDetailBody({ data, sg, label }: Props) {
  const [openHole, setOpenHole] = useState<number | null>(null)
  const sgByHole = new Map(sg.holes.map((h) => [h.holeNumber, h]))

  return (
    <>
      {data.holes.length === 0 ? (
        <p className="text-sm text-fg-2">
          Entered as a total score. The strokes gained shown on the card is an estimate from the round totals (fairways, greens, putts and up-and-downs), against scratch. Log a round hole by hole for a real breakdown.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">Strokes gained vs {label}. Tap a hole for its parts.</p>
          <ul className="divide-y divide-fg/[0.06]">
            {[...data.holes]
              .sort((a, b) => a.hole_number - b.hole_number)
              .map((h) => {
                const r = sgByHole.get(h.hole_number)
                const expanded = openHole === h.hole_number
                const shots = data.shots.filter((s) => s.holeNumber === h.hole_number).sort((a, b) => a.shotNumber - b.shotNumber)
                const pin = shots.find((s) => s.toLie === "holed")?.to ?? null
                const lines = shots.flatMap((s) => (s.from && s.to ? [{ from: s.from, to: s.to }] : []))
                return (
                  <li key={h.hole_number}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpenHole(expanded ? null : h.hole_number)}
                      className="flex min-h-[44px] w-full items-center gap-3 py-2 text-left text-sm"
                    >
                      <span className="w-6 shrink-0 text-muted">{h.hole_number}</span>
                      <span className="min-w-0 flex-1 text-fg">
                        {h.strokes} <span className="text-muted">on par {h.par}</span>
                        <span className="block text-xs text-muted">
                          {r?.source === "shots" ? "Tracked shots" : "Scorecard"}
                          {r?.puttEstimated && r.categories ? ", first putt estimated" : ""}
                        </span>
                      </span>
                      {r && <span className={["shrink-0 font-semibold", r.total >= 0 ? "text-accent" : "text-danger"].join(" ")}>{fmtSg(r.total)}</span>}
                    </button>
                    {expanded && (
                      <div className="space-y-3 pb-3 text-sm">
                        <dl className="grid grid-cols-4 gap-2 text-center">
                          {(["off_tee", "approach", "short_game", "putting"] as const).map((c) => (
                            <div key={c}>
                              <dt className="text-xs text-muted">{CATEGORY_LABEL[c]}</dt>
                              <dd className="font-semibold text-fg">{r?.categories ? fmtSg(r.categories[c]) : "–"}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="text-xs text-muted">
                          Putts {h.putts ?? "–"} · Fairway {yesNo(h.fairway_hit)} · Green {yesNo(h.green_hit)}
                          {h.first_putt_ft != null && ` · First putt ${h.first_putt_ft} ft`}
                          {!r?.categories && " · No putts entered, so only the hole's total"}
                        </p>
                        {shots.length > 0 && (
                          <>
                            <ul className="divide-y divide-fg/[0.06]">
                              {shots.map((s) => (
                                <li key={s.shotNumber} className="flex justify-between gap-3 py-1.5 text-fg-2">
                                  <span className="min-w-0 truncate">
                                    {s.shotNumber}. {s.club}
                                    {!s.clubConfirmed && s.club !== "Putter" && " (suggested)"}
                                  </span>
                                  <span className="shrink-0 text-xs text-muted">
                                    {s.from && s.to ? `${Math.round(distanceYds(s.from, s.to))} yd · ` : ""}
                                    {lieLabel(s.fromLie)} → {lieLabel(s.toLie)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {lines.length > 0 && <ShotsMap lines={lines} pin={pin} />}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
          </ul>
        </>
      )}
    </>
  )
}
