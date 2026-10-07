// "How this is scored" under the Play planner's card (moved verbatim from CourseMapClient.tsx).

import { SMART_MAX_PENALTY_RATE } from "@/lib/course/strategy"

export function ScoringDetails({
  baselineHandicap,
  onCourseSpread,
  onShowIntro,
}: {
  baselineHandicap: number | null
  onCourseSpread: number
  /** Reopens the first-visit intro. */
  onShowIntro?: () => void
}) {
  return (
    <details className="rounded-2xl border border-fg/[0.07] bg-surface px-4 py-3 text-xs leading-relaxed text-fg-3">
      <summary className="cursor-pointer select-none font-medium text-fg-2">How this is scored</summary>
      <div className="mt-2 space-y-2">
        {onShowIntro && (
          <button onClick={onShowIntro} className="flex min-h-[44px] items-center text-sm font-semibold text-accent hover:underline md:min-h-0">
            Show the intro again
          </button>
        )}
        <p>
          Every shot is placed on the map and given a lie (green, fairway, rough, bunker, trees, water or out of bounds).
          Its value is the average number of strokes to hole out from that lie and distance, plus one for the shot itself.
          The starting point is Mark Broadie&rsquo;s published PGA TOUR benchmark (<em>Assessing Golfer Performance on the
          PGA TOUR</em>, Interfaces 2012, Table 9; putting from <em>Putts Gained</em>, 2011).
        </p>
        <p>
          {baselineHandicap == null ? (
            <>You&rsquo;re comparing against the PGA TOUR (change it on You, under Settings). </>
          ) : (
            <>
              Scored for a {baselineHandicap.toFixed(1)} handicap (change it on You, under Settings).{" "}
            </>
          )}
          No one publishes amateur tables by lie, so the handicap version adjusts the tour numbers: a bit worse from everywhere
          (sized so a par-72 round adds up to 72 plus your handicap), a bigger penalty for rough, sand and trees, and
          putting from a given distance as hard as a pro&rsquo;s from farther away, using Broadie&rsquo;s amateur figures where
          they exist. The extra penalty for bad lies is an estimate.
        </p>
        <p>
          The card gives two options from the same ranking. <strong className="font-medium text-fg-2">Go for it</strong> is the
          club with the fewest expected strokes. <strong className="font-medium text-fg-2">Smart play</strong> (the default)
          is the safe, set-up-for-par play: a club and aim are only allowed if no more than {Math.round(SMART_MAX_PENALTY_RATE * 100)}%
          of shots finish out of bounds, in water or in the trees (a drop, a punch-out or a lost ball). Each club is
          aimed away from the trouble first, and Smart play is the fewest strokes among those that qualify. When none
          does, it is the lowest-risk club. Go for it has no limit. When both are the same play there is just one
          option. Your misses are
          widened to {onCourseSpread.toFixed(2)}x of what the range data shows, since range data is tighter than real rounds
          (change it on You, under Planner). On par 5s and par 4s over 440 yd, each tee shot is valued by the best next shot
          from where it finishes, not by a table that assumes every distance can be played. The penalty limit
          and the spread are estimates, not measurements.
        </p>
        <p>
          Every club gets its own aim: its search starts on the hole&rsquo;s centre line at the distance that club goes
          and tries every aim up to 60 yd either side, so a 7-iron lay-up is judged aimed at the fairway, not at the
          driver&rsquo;s corner. The Aim column says where it ended up. Each club&rsquo;s aim is picked on half its shots and
          scored on the other half, so the number isn&rsquo;t the search grading its own winner. Tap a club to aim it.
        </p>
        <p>
          The table&rsquo;s last column compares every club against the best one here, not against a tour player: the best
          club is always +0.00 and every other club shows how many extra strokes it&rsquo;s expected to cost. &ldquo;~
          tie&rdquo; means the gap is smaller than one standard error of the difference, i.e. within what a different
          sample of the same shots could change.
        </p>
        <p>
          Driver and 3-wood shots land at their carry and then roll out along their line before they&rsquo;re scored, so
          for those the dots, the lie percentages and &ldquo;leaves&rdquo; are where shots stop (Layers &rarr; Show carry
          points adds the landing spots). Every other club is scored where it lands. Roll is an estimate, not measured:
          about 20 yd for a driver and 12 for a 3-wood on the fairway, give or take 30%; a third of that in the rough, a
          fifth in trees, none in bunkers or water. A ball that runs into a bunker or water stops there.
        </p>
        <p>
          The aim marker sets the direction for a full swing: each club flies its own carry along that line, so the
          &ldquo;Aim line&rdquo; distance is where the line is drawn to, not a distance to hit.
        </p>
        <p>
          Water costs one penalty stroke plus a drop; out of bounds is stroke and distance; trees use the benchmark&rsquo;s
          &ldquo;recovery&rdquo; column. These rules are my assumptions, since the benchmark doesn&rsquo;t cover them.
        </p>
        <p>
          Shapes come from OpenStreetMap volunteers. Outside the mapped course boundary is out of bounds, and so are
          buildings and roads (not cart or walking paths); woods, scrub, tree rows and gardens inside the boundary play as
          trees. Untraced ground counts as rough, and the card warns when more than a fifth of a club&rsquo;s shots end up
          on it. A ball in the water is
          dropped where it last crossed into it, with one penalty stroke. The ✓ / ⚠ / ✗ line shows what is
          mapped, estimated or missing for this hole; Layers → Mark an area outlines trees, water, out of bounds, or a safe
          patch the map got wrong. Your marks beat the map, and a missing fairway is estimated as a corridor down the middle
          until you draw the real one. Slope, wind and elevation aren&rsquo;t modelled.
        </p>
      </div>
    </details>
  )
}
