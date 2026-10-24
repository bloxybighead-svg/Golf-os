// The week as a checklist: items done of required, rebuilt from the latest runs and rounds, and on Mondays last week's row.

import type { PracticeWeek } from "@/hooks/usePracticeWeek"
import { AREA_LABEL } from "@/lib/practice/weakness"

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

export function WeekCardView({ week }: { week: PracticeWeek }) {
  const { view, typical, lastWeek } = week
  return (
    <div className="rounded-xl border border-fg/[0.06] bg-surface px-5 py-4">
      <p className="label-xs">This week</p>

      {typical && <p className="mt-3 text-sm text-fg-2">Based on typical golfers until you log 3 rounds</p>}
      {view.topChange && <p className="mt-3 text-sm text-fg">{view.topChange}</p>}
      <ul className="mt-1 divide-y divide-fg/[0.06]">
        {view.week.items.map((i) => (
          <li key={i.area} className="flex min-h-[44px] items-center justify-between gap-3 text-sm">
            <span className="text-fg">{AREA_LABEL[i.area]}</span>
            <span className={i.done >= i.required ? "font-semibold text-accent" : "text-fg-2"}>{i.done >= i.required ? "Done" : `${i.done} of ${i.required}`}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">
        {view.week.minutes} min planned
        {view.week.dropped.length > 0 && ` · left out to fit the week: ${view.week.dropped.map((d) => `${AREA_LABEL[d.area]} ${d.count}`).join(", ")}`}
      </p>

      {lastWeek && (
        <div className="mt-4 border-t border-fg/[0.06] pt-3 text-sm">
          <p className="label-xs">Last week</p>
          <p className="mt-2 text-fg">
            {lastWeek.done} of {lastWeek.planned} items · {lastWeek.minutes} min
          </p>
          {lastWeek.best && (
            <p className="text-fg-2">
              Best: {lastWeek.best.name} {lastWeek.best.from} → {lastWeek.best.to}
            </p>
          )}
          {lastWeek.tiger5.week != null && lastWeek.tiger5.recent != null && (
            <p className="text-fg-2">
              Tiger 5: {one(lastWeek.tiger5.week)} a round, against {one(lastWeek.tiger5.recent)} over your last 10
            </p>
          )}
        </div>
      )}
    </div>
  )
}
