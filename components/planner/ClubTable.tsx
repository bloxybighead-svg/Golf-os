"use client"

// The Play planner's club table: every club at its own best aim (moved verbatim from CourseMapClient.tsx).

import type { Lie } from "@/lib/course/lies"
import { aimOffsetLabel, isTie, type OptimizedClubPlan } from "@/lib/course/plan"
import { LIE_LABEL, LIE_SHORT, pct } from "@/lib/planner/labels"

export interface ClubTableProps {
  ranking: OptimizedClubPlan[]
  /** A newer ranking is on its way (the table dims). */
  pending: boolean
  /** How long the worker took, exposed as data-rank-ms for speed checks. */
  rankMs: number | null
  shownLies: Lie[]
  best: OptimizedClubPlan | null
  chosen: OptimizedClubPlan | null
  estimatedFrom: Record<string, string>
  /** The scoring baseline's label ("PGA TOUR" or "3.0 handicap"). */
  baselineLabel: string
  onPick: (r: OptimizedClubPlan) => void
}

export function ClubTable({ ranking, pending, rankMs, shownLies, best, chosen, estimatedFrom, baselineLabel, onPick }: ClubTableProps) {
  return (
    <div
      className={`overflow-x-auto rounded-2xl border border-fg/[0.07] bg-surface transition-opacity ${pending ? "opacity-60" : ""}`}
      aria-busy={pending}
      data-rank-ms={rankMs != null ? Math.round(rankMs) : undefined}
    >
      {pending && <p className="px-3 pt-2 text-[11px] text-muted">Ranking…</p>}
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="border-b border-fg/[0.06] text-left text-muted">
            <th className="px-3 py-2.5 font-medium">Club</th>
            <th className="px-1 py-2.5 text-right font-medium" title="Each club's own best aim: yards left or right of the hole's centre line at its distance">
              Aim
            </th>
            <th className="px-1 py-2.5 text-right font-medium">Carry</th>
            <th className="px-1 py-2.5 text-right font-medium" title="Carry plus roll">
              Total
            </th>
            {shownLies.map((l) => (
              <th key={l} className="px-1 py-2.5 text-right font-medium" title={LIE_LABEL[l]}>
                {LIE_SHORT[l]}
              </th>
            ))}
            <th
              className="px-3 py-2.5 text-right font-medium"
              title={`Extra strokes to hole out vs the best club here (${best?.club ?? "—"}), each club at its own best aim, scored for ${baselineLabel === "PGA TOUR" ? "the PGA TOUR" : `a ${baselineLabel}`}. "~ tie" = within the noise of the shot samples`}
            >
              vs {best?.club ?? "best"}
            </th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r) => (
            <tr
              key={r.club}
              onClick={() => onPick(r)}
              className={`cursor-pointer border-b border-fg/[0.04] transition-colors last:border-0 hover:bg-fg/[0.04] [&>td]:py-2.5 md:[&>td]:py-1.5 ${
                chosen?.club === r.club ? "bg-accent/10" : ""
              }`}
            >
              <td className="whitespace-nowrap px-3 font-semibold text-fg">
                {r.club}
                {estimatedFrom[r.club] && (
                  <span className="ml-1 text-[10px] font-normal text-muted" title={`No ${r.club} shots on record: estimated from your ${estimatedFrom[r.club]}`}>
                    est.
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-1 text-right text-fg-3">{aimOffsetLabel(r.offsetYds)}</td>
              <td className="px-1 text-right text-fg-3">{Math.round(r.plan.meanCarryYds)}</td>
              <td className="px-1 text-right text-fg-3">{Math.round(r.plan.meanTotalYds)}</td>
              {shownLies.map((l) => (
                <td key={l} className="px-1 text-right text-fg-3">
                  {pct(r.plan.lieShare[l])}
                </td>
              ))}
              <td className="whitespace-nowrap px-3 text-right font-semibold text-fg">
                {best && r !== best && isTie(r.plan, best.plan)
                  ? "~ tie"
                  : `+${(r.plan.expectedStrokes - (best?.plan.expectedStrokes ?? 0)).toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
