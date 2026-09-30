# Shot Pattern Simulator — Handoff

Context document for picking this project up in a fresh session. Written
2026-09-01.

## The project

School capstone extension for **Golf OS**, a Next.js/Supabase golf
analytics app (repo: `github.com/bloxybighead-svg/Golf-os`, live at
golf-os-ten.vercel.app). Owner: Dillon Cady, a 1.9–4 handicap golfer.
Advisor: Bryant Duong, meets in two 30-minute check-ins.

**The problem being solved:** golfers badly underestimate their own shot
dispersion and make poor course decisions as a result. Building the
analytics features (dispersion analysis, T-box estimation, aim-point
optimization) needs thousands of shots per player, which no user will
hit. So step 1 is a simulator that generates statistically realistic
shot data, with real data swapped in as users log it.

**Work lives on the `extension` branch**, in `shot-pattern-simulator/`.
`main` holds the untouched website. Do not merge until the extension is
finished — the plan is one merge at the end.

## Status

**Step 1 (synthetic golfer model): COMPLETE**, ahead of its 08/25
deadline, then substantially revised across two rounds of advisor
feedback. ~1,600 lines of Python across 6 files.

**Step 2 (Supabase seed): COMPLETE (2026-09-01).** `golfer_profiles`
(11 rows, one per club, Dillon's calibrated profile) and `simulated_shots`
(2,000 rows generated from that profile, seed 42) are live on the
project's Supabase instance. Schema, views, and example queries are in
`supabase/simulated_shots_schema.sql`, `simulated_shots_views.sql`, and
`simulated_shots_queries.sql`. Two views do the analytics in SQL as
required: `club_dispersion` (mean/SD/percentiles per club) and
`club_gapping_overlap` (10th-90th percentile carry-range overlap between
every club pair — already surfaced a real gapping issue: GW/PW overlap
52%, 3-Wood/Driver overlap 39%). No `users` table exists yet, so
`golfer_profiles.golfer_name` is a free-text label, not a foreign key —
swap it for a `user_id` once Supabase Auth is added.

**Step 3 (browser rendering + T-box): CORE COMPLETE (2026-09-05).** Note:
"T-box estimator" means recommending which **tee box** a golfer should
play (Black/Blue/White/etc.) from course rating, slope rating, handicap,
and driver distance — not a target-box derived from dispersion. That
wasn't written down anywhere before now; recorded here so it doesn't need
re-clarifying.

Built, tested (21 passing vitest unit tests, `npm test` from `golf-os/`),
and verified live in the browser:
- `lib/dispersion/transform.ts` — explicit yards↔pixels transform
  (origin + scale), used by every render call, nothing implicit.
- `lib/dispersion/polygon.ts` — ray-casting point-in-polygon test +
  `makeFairwayPolygon()` (a placeholder trapezoid, swappable for a real
  GPS-traced course polygon later without touching the point-in-polygon
  logic).
- `components/simulator/DispersionCanvas.tsx` — SVG renderer: fairway
  polygon, gridlines, tee marker, shot dots, and a live "N / total shots
  landed inside the shaded area (X%)" readout — the actual "are the
  sampled points inside the polygon" QA, run against the real 2,000-shot
  Supabase dataset, not a synthetic fixture.
- `app/planner` — new page, club picker + adjustable target width,
  reads live from `golfer_profiles`/`simulated_shots` (had to paginate
  the Supabase query — it silently caps at 1,000 rows per request).
- `lib/tbox/estimate.ts` — USGA Course Handicap formula (exact, sourced)
  + an approximate "recommended course yardage ≈ 25× driver carry"
  heuristic (approximates the shape of USGA's Tee It Forward guidance
  from memory — flagged as unverified, same as the model's other
  unsourced constants, replace with the real published table if
  precision matters).
- `app/planner/tbox` — new page, tee-comparison table with a "load
  rating/slope/par from a course you've already logged" shortcut that
  pulls real data straight from the `rounds` table (the actual link
  between this feature and Golf OS's existing tables) — yardage still
  needs manual entry since `rounds` doesn't track it.

**Rest of Step 3, done (2026-09-09):**
- `app/planner/compare` — two-golfer overlay UI. Since no second real
  golfer exists yet (see Known limitations), the second "player" is a
  synthetic `from_band("2-4")` golfer seeded as `golfer_name = "Average
  2-4 Handicap"` — a legitimate, labeled stand-in, not a fabricated
  person. Shows: an overlaid dispersion scatter (`OverlayCanvas.tsx`),
  a side-by-side stats table, a checkbox overlaying Dillon's real shots
  (new `real_shots` table, seeded from `reference_data/real_shots.csv`,
  589 rows), and a 500/1000/2000 shot-count radio.
- Had to go back and reseed: the original 2,000-shot batches only had
  ~150-200 shots per club, so selecting 500 vs 1000 vs 2000 silently
  capped and showed identical numbers. Fixed by regenerating ~2,200
  shots *per club* (`sample_shots(n_shots, clubs=[...])`) for the 8
  clubs both golfers share, ~17,600 rows per golfer. Real "how does this
  change over time" answer is now visible in a convergence table: Driver
  carry SD at n=500/1000/2000 is 11.08 / 11.11 / 11.28 — shrinking
  sampling noise, not a real change in the golfer, and the UI says so
  explicitly so it doesn't get misread as skill drift.
- `lib/dispersion/stats.ts` — shared mean/SD/percentile + seeded-sample
  helpers, tested (26 vitest tests total now).

**Realism verdict ("does the spread look realistic to tendencies?"):**
ran `validate_against_reference.py` fresh across handicaps 0/4/8/12.
Confirms the already-documented pattern: carry means run ~8-14 yds long
and carry/offline SDs run consistently *tighter* than the reference set,
growing with handicap. Per the model's own prior note this reference
set is stale (pre-dates a carry-table correction), so the gap isn't
fresh evidence of a problem -- but it's still the most honest summary:
**where checked against real/published sources (direction SDs, iron
gapping ratios, the offline=carry×tan(start_line)+curve relationship,
carry ceiling/floor) the model holds up well; where it hasn't been
checked against fresh data (this validation script, mishit severity,
one-golfer club-distance ratios) it leans slightly too tight and slightly
too long.** Getting a second real golfer's data would settle this for
real instead of comparing against a known-stale reference.

**Feature ideas for amateur golfers** (brainstorm, not built): a "bag
gap advisor" surfacing `club_gapping_overlap` findings automatically
(the GW/PW 52% overlap is exactly this); a pre-round "what carry can I
trust" card using `carry_p10` instead of average (the model already
computes this); an aim-bias coach flagging clubs with an unusually large
median offline (PW's -11.1yd median, found earlier); the T-box estimator
surfaced at round-logging time instead of as a separate page; a
"realistic expectations" onboarding screen showing a new user's own
dispersion pattern against their self-estimate, since underestimating
dispersion is literally the problem this whole project exists to fix.

**Kaggle-set comparison: done (2026-09-09).** Dillon found the file —
`Desktop/golf_trajectories.csv` (832 rows, no club labels, matches the
"handedness unknown" note). It has no explicit curve/start-line columns,
so those were rebuilt the same way the model itself defines them:
`start_line = Launch Direction`, `offline = Carry Deviation Distance`,
`curve = offline - carry × tan(start_line)`. 797 rows survive a basic
sanity filter (carry 30-350 yds) — matches the "796-shot" citation
almost exactly, good sign it's the right file/method.

Refit the curve→carry slope fresh: **+0.669 raw, +0.395 controlling for
ball speed** — positive, confirming (not just repeating) the prior
session's finding that this golfer's sign is opposite Dillon's
(his per-club range is -0.288 to -0.892, all negative).

Then actually ran the simulator both ways: regenerated 2,000 Driver
shots twice, identical in every parameter except `curve_carry_slope` —
once at Dillon's own -0.292, once at the Kaggle-derived +0.395. Real,
visible consequence: corr(offline, carry) flips from -0.436 to +0.529 —
the whole dispersion ellipse's diagonal lean reverses direction. Plot:
`output/kaggle_slope_comparison.png`.

**Revised finding — the sign disagreement is very likely a handedness
artifact, not real physics disagreement.** Dillon's own instinct: a draw
(curving left for a right-hander) is the lower-spin, longer shot shape —
that's the physical mechanism the model's own comment already cites,
and it should hold for any right-handed golfer. If the Kaggle golfer is
left-handed and the raw columns record left/right in an absolute frame
rather than "relative to the player," their longer, lower-spin shots
(their draw, curving to *their* left = *our* right) would show up as
positive offline correlating with longer carry — exactly the "opposite"
sign observed, without the underlying physics actually disagreeing.

Tested by mirroring the Kaggle data's left/right (negating both launch
direction and deviation) and refitting: slope becomes **-0.395**,
landing right inside Dillon's own -0.892 to -0.288 range. Reran the
simulator once more with this corrected slope: corr(offline, carry)
comes out **-0.531**, same direction as Dillon's -0.436 — both ellipses
now lean the same way. Plot: `output/kaggle_slope_comparison_corrected.png`
(both sent to Dillon).

**Net conclusion:** the curve→carry relationship (draws carry farther,
fades come up short) looks like it may be universal after all — the
earlier "two real golfers disagree" framing was likely an artifact of
not knowing this golfer's handedness, not a real per-golfer difference.
Still can't be fully certain without ground truth on handedness, but the
corrected sign fits Dillon's measured range far too well to be
coincidence. `_DEFAULT_CURVE_CARRY_SLOPE` and the "two datasets disagree
on sign" framing in the Weak/assumed section above should probably be
revisited with this in mind — worth a note to Bryant.

**Custom Golfer tool + real course lookup added (2026-09-09):**
- `app/planner/custom` — the browser now has the same "plug in
  handicap + carries, generate" flow as `generate_shots.py --handicap N
  --carry CLUB=YDS`, running fully client-side. Required porting the
  handicap/band path of `synthetic_golfer.py` (not the calibrated/
  real-data path — that has no browser equivalent since it needs a real
  golfer's shot history) to TypeScript: `lib/golfer/tables.ts`
  (DEFAULT_PROFILES, handicap interpolation, scale-to-carries),
  `lib/golfer/generate.ts` (the carry/direction/curve/clamp sampling
  loop, including the exponential floor taper), `lib/golfer/build.ts`
  (ties them together). Cross-checked against the real Python model for
  the same inputs (handicap 8, Driver=260, seed 1, n=4000): Python
  mean=260.07/sd=16.98/offline_sd=28.54 vs TS mean=260.30/sd=16.75/
  offline_sd=28.99 — within normal sampling noise, not a systematic
  drift. 15 new vitest tests (41 total). Nothing generated here is
  persisted to Supabase — it's an exploratory tool, ephemeral by design.
- T-box estimator can now search a real course and auto-fill every tee's
  actual rating/slope/par/yardage, instead of manual entry only. Found
  [OpenGolfAPI](https://opengolfapi.org) (free, keyless, ODbL-licensed,
  16,800+ US courses) after checking it actually works live, not just
  trusting its marketing page. Proxied server-side through
  `app/api/courses/search` and `app/api/courses/[id]/tees` (keeps the
  browser from talking to a third party directly, avoids CORS). Hit and
  fixed a real bug: OpenGolfAPI's `name` field isn't reliably populated
  (multi-word queries like "Spyglass Hill" only return `course_name`) --
  route now prefers `course_name` with a fallback chain.

**Step 4 (aim-point optimization) + statistical validation, done
(2026-09-19):**
- `statistical_analysis.py` — three checks, all against real Dillon
  shots (`reference_data/real_shots.csv`, full swings only):
  1. **Significance tests** (simulated calibrated-profile output vs
     real): two-sample t-test + two-sample KS test on carry and
     offline, per club. Result: **11/11 clubs pass the KS test on both
     carry and offline (p>0.05)** — the simulator's output is
     statistically indistinguishable from the real data it's fit to.
     No detectable bias from the skew/clamp/taper/curve-link machinery.
  2. **Bootstrap 95% CIs** (percentile method, 5000 resamples) for
     real-shot mean carry and SD, every club with n>=5.
  3. **Power analysis** (revised 2026-09-26): for each n, average the
     bootstrap CI half-width over 200 random subsamples (the earlier
     single-subsample curve was noisy). Answer to "how many real shots
     before the fit means anything": **mean-carry CI half-width reaches
     +/-2 yd at ~35 shots for a 7-iron and ~140 for the driver**, matching
     n = (1.96*s/h)^2 (33 and 139). Clubs below ~15-20 real shots (PW n=10,
     3-Wood n=11, 4-Iron n=7, 9-Iron n=5) should be flagged low-confidence.
     (The earlier "25-35 / 100-130" figures are superseded.)
  4. **Held-out validation** (added 2026-09-26): 5-fold, whole SESSIONS
     held out (19 full-swing sessions). 7/7 testable clubs pass KS on
     carry and offline on unseen sessions; wedges borderline (56 deg
     p~0.06). An uncalibrated handicap-3 model passes KS on carry for
     only 3/8 clubs. Section 1's 11/11 remains in-sample.
  Also produced a visual distribution-overlap check (histograms,
  simulated vs real, Driver + 7-Iron, carry and offline) — matches the
  KS-test result visually. Added scipy as a dependency (t-test, KS
  test) -- `pip install scipy`, now in requirements.txt.
- `aim_point_optimizer.py` — grid search over aim point (offline x
  carry offset from the pin, 11x5=55 candidates), 3,000 simulated
  shots per candidate, scored against an **illustrative** hole (organic
  green, kidney bunker front-left, water right) with a simple
  distance-to-pin cost model (cost = strokes REMAINING after the shot
  lands; excludes the approach shot). Hole geometry AND stroke costs are
  placeholders -- the point is the mechanics. **Fixed 2026-09-26:** the
  winner (best of 55) used to be t-tested on the same shots that picked it,
  which is optimistic AND underpowered. It is now re-tested on a fresh,
  paired 10,000-shot sample. Results: calibrated Dillon aims +5 yd right
  (his natural miss averages -3.9 yd left), saving 0.024 strokes/approach
  (95% CI 0.014-0.033, p<0.001) -- this REPLACES the earlier "not
  significant (p=0.696/0.368)" claim, which was a power problem, not
  evidence of no effect. One synthetic 22-handicap (seed 99): 0.037
  strokes, aims -5/-5, but its personal bias is +15.9 yd right, so that
  direction is a property of that random golfer.
- `aim_point_population.py` (new 2026-09-26) — 200 random golfers each at
  handicaps 3/10/22, vectorized scoring (checked 100% against the
  ray-casting scorer), each winner confirmed on 10,000 fresh paired
  shots. Median saving 0.003 / 0.017 / 0.051 strokes per approach; aim
  direction correlates -0.78/-0.91/-0.97 with the golfer's own average
  miss; 100% of 22 and 98.5% of 10 handicaps aim short. See
  STATISTICAL_ANALYSIS.md sections 6-7.
- Plots were restyled per advisor feedback (2026-09-19 meeting): white
  page, light-gray plot areas, distinct dot colors (white = aimed at pin,
  yellow = aimed at recommended point, magenta diamonds = real shots), and
  a zoomed panel on the pin vs recommended aim.

**Remaining milestones, in order:**
5. Calibration screen — golfers enter real shots in the app, model
   refits live. Then write the README and make the repo public.
6. Real hole/hazard geometry for aim-point optimization (currently an
   illustrative placeholder) and a cited stroke-cost model (currently a
   simple distance-based stand-in) — both flagged above as the honest
   next step if this needs to be more than a demo.

The CSV schema (`club, carry_yds, offline_yds, start_line_deg,
curve_yds, session_id, is_mishit`) is already shaped for step 2's
tables, and `carry_yds`/`offline_yds` are exactly the coordinates step
3's renderer needs.

### Navigation (2026-09-28, R1)

Three tabs, one `<nav>` in `components/NavBar.tsx` (bottom bar on phones,
right side of the top bar on desktop): Play (`/`, also lit on `/planner`),
Rounds, You (`/you`, `/you/bag`). No sub-navs. Account/sign-out lives on
the You page. Retired URLs (`/log`, `/drills`, `/trends`, `/planner/*`
sub-tabs, `/simulator/*`) redirect in next.config.mjs. See "R1" below.

### Phone / app-store readiness (2026-09-26)

Mobile-first pass: bottom tab bar on phones (top tabs on desktop), safe-area
padding, 16px inputs (stops iOS zoom), 40px touch targets on coarse pointers,
scrolling sub-tabs / hole strip / toolbar, collapsed golfer settings, an
on-map HUD (club, to aim, left, to pin), Follow-my-GPS (`watchPosition`,
2.5 s throttle), settings + recent courses + course maps saved on the device
(localStorage; offline course reuse, tiles still need signal), web app
manifest + icons so it installs to the home screen. Real App Store / Play
Store distribution would wrap this in Capacitor (needs Apple developer
account, privacy policy, and Sign in with Apple once accounts exist).

### Golfer inputs (2026-09-26)

Handicap-based golfers (Course Planner and Custom golfer) take handicap, known
carries (Driver / 7-iron in the planner; any clubs on Custom golfer) and a miss
tendency (`lib/golfer/build.ts`: straight / left / right / both ways x slight,
moderate, strong = 0.5, 1.0, 2.0 degrees of average start-line bias; these
degree values are judgement, not measured). A stated tendency replaces the
handicap's random per-golfer lean (bias SD drops to 0.3 deg).

### Course Planner (added 2026-09-26, branch `course-map`)

`/planner` overlays simulated dispersion on a real course.
Search a course (OpenGolfAPI gives its lat/lng) -> `/api/courses/geometry`
finds its boundary in OpenStreetMap, then loads holes, greens, fairways,
bunkers, tees, water ways and nearby coastline through the Overpass API
(three small queries, because the public servers reject "area + full
geometry" queries; they are also often busy, so the route races two servers
and retries within a 52 s budget). The map is Leaflet over Esri World
Imagery. The golfer drags a ball / aim / pin marker (or uses browser GPS);
every club's shots are fired along the ball->aim line, each landing is
classified water / bunker / green / fairway / rough by point-in-polygon
(`lib/course/lies.ts`, coastline = sea on the right of the way), and clubs
are ranked by expected strokes (`lib/course/plan.ts`, `cost.ts`).
"Find best aim" shifts the aim left/right in 2 yd steps.

Strokes gained (2026-09-26): `lib/course/cost.ts` now uses the PUBLISHED PGA
TOUR benchmark, transcribed programmatically from the paper PDFs into
`lib/course/broadieTables.ts` -- Broadie, "Assessing Golfer Performance on the
PGA TOUR", Interfaces 42(2) 2012, Appendix Table 9 (tee / fairway / rough /
sand / recovery by yard, 8M+ ShotLink shots 2003-2010) and Broadie, "Putts
Gained" (2011, average putts by foot). Trees use the "recovery" column. Water
(1 stroke + fairway drop) and out of bounds (stroke and distance) are MY
conventions, since the benchmark doesn't cover them. It is a TOUR baseline:
amateurs' SG is mostly negative, so compare clubs/aims against each other.
Still on the placeholder costs: `shot-pattern-simulator/aim_point_optimizer.py`
(the paper's Section 5 numbers) -- port Table 9 there before quoting both
together. The map also has a Trouble map (strokes vs fairway per cell) and
50/90% shot rings (`lib/course/heatmap.ts`).

Known limits: anything not traced in OSM counts as
rough; lakes mapped as multipolygon relations are skipped; no trees, slope,
wind or elevation; best-aim reuses the shots it picks on (optimistic).
Overpass reliability was the weak link, so geometry is now cached: memory ->
Supabase table `course_geometry` (SQL in `supabase/course_geometry_cache.sql`,
public read, keyed by OpenGolfAPI course id) -> live Overpass. The route only
WRITES the cache if `SUPABASE_SERVICE_ROLE_KEY` is set (Vercel env + optional
.env.local); without it everything still works but nothing is persisted.
A failed (busy) query returns 502 and the page auto-retries 3x; successful
sub-queries are memoised so retries only repeat what failed. Courses with no
OSM boundary/hole tagging fall back to a radius search (warned in the UI;
hole numbers may be missing and neighbouring courses may appear, e.g.
Bethpage). Penalty lies (added after Dillon's feedback that drivers were always
recommended): water, rough, bunker and trees (mapped `natural=wood`/
`landuse=forest`) all cost real strokes via the Broadie tables above; out of
bounds is a driving range / practice area (`golf=driving_range`, or a
"fairway" no hole centerline touches) costing a stroke plus a replay from
where you hit.

Hand-marked zones (2026-09-27, replaces the old "trees beyond N yd of hole
line" corridor): most courses have few or no trees traced in OSM, and a
symmetric distance-based corridor penalised BOTH sides of a hole even when
trouble was only on one -- wrong aim, wrong strokes gained. "Mark area" in the
map toolbar lets the golfer hand-draw trees, water, a bunker, out of bounds,
or a safe fairway/rough/green patch (to correct a wrong map) directly on the
satellite image; each is a tap-to-add-vertex polygon (`>=3` points, Undo/
Finish/Cancel, or tap the enlarged first vertex again to close it -- a mobile
shortcut, pixel-distance hit test in `CourseMap.tsx`'s click handler). In
`lib/course/lies.ts`, `buildLieMap`'s zones are checked BEFORE the OSM-derived
polygons and coastline, last-drawn-wins on overlap, so a zone always overrides
the map. `UserZone` reuses the `Lie` type directly (no FeatureKind
indirection). Cached geometry carries `version` (GEOMETRY_VERSION); older rows
are ignored and refetched. Tests: `lib/course/course.test.ts`.

Accounts + per-user zone sync (2026-09-27): Supabase Auth (email/password),
`middleware.ts` refreshes the session cookie every request, `/login` (sign
in + create account, `components/auth/LoginForm.tsx`), `AccountMenu` in
`NavBar` (email + sign out) fed by a server-side `auth.getUser()` in
`app/layout.tsx`. New table `public.course_zones` (`supabase/course_zones.sql`
-- course_id, user_id, lie, ring jsonb; RLS owner-only, `auth.uid() = user_id`
on every policy). Signed-in: zones read/write straight to that table from
`CourseMapClient.tsx` (no server route -- RLS does the enforcement). Signed
out: unchanged localStorage behavior (`golfos.zones.<courseId>.v1`). Marks
made before signing in are offered a one-time upload ("Save to my account"
banner, `localOnlyZones`/`syncLocalZonesToAccount`) rather than silently lost
or merged. **Gotcha that cost a debug cycle:** supabase-js query builders are
lazy thenables -- `void supabase.from(...).delete()...` builds the request but
never SENDS it; it must be `await`ed (or `.then()`-ed) or nothing happens over
the wire, even though nothing throws. Caught by checking row counts in the DB
directly, not by trusting the (optimistically-updated) UI.

Full per-user RLS rollout (2026-09-27): extended the `course_zones` pattern to
every other personal-data table -- `rounds`, `drills`, `practice_sessions`,
`session_blocks`, `milestones` (`supabase/per_user_data.sql`). Each got a
`user_id uuid references auth.users(id) on delete cascade`, backfilled to
Dillon's real account (`dilloncady@yahoo.com`, not the mailinator test
account) since all existing rows were his, then set `NOT NULL` with the same
4-policy owner-only RLS as `course_zones`. `wedge_reference` (unused by the
app, a shared lookup table, not per-user) just got RLS turned on with a
public-read policy, closing the anon-write hole without touching its meaning.
`golfer_profiles`/`real_shots`/`simulated_shots`/`course_geometry` were left
alone -- checked every call site first (`grep .from(...)` across the whole
app) and confirmed they're read-only shared reference/calibration data with no
in-app write path, so "public read" is correct for them, not a gap.

Every server action that inserts now requires a signed-in user and stamps
`user_id`; update/delete actions also require one so a signed-out call fails
with a clear "Sign in to ..." message instead of a silent RLS no-op. Reads
still rely on RLS alone (no explicit `.eq("user_id", ...)` needed) -- signed
out, every list is legitimately empty, so Home/Rounds/Drills/Log/Trends each
got a `SignedOutNotice` banner (`components/auth/SignedOutNotice.tsx`) so that
reads as "sign in to see this" rather than "your data is gone." **This is a
real behavior change**: Log/Drills/Rounds/Trends now require an account to use
at all (previously fully usable as a guest) -- the course planner's hand-drawn
zones are the only feature that still has a guest/localStorage fallback.
Verified with the anon key directly: `select` returns `[]`, `insert` returns
`42501` (RLS violation), same as the `course_zones` check. `dilloncady@yahoo.com`
already existed in `auth.users` from earlier testing.

Data-quality badge + trustworthy SG (2026-09-27, later): Rumson GC exposed a
real trust problem -- it has only 4 greens, 3 fairways and 5 bunkers traced
across 18 holes, so most holes silently treated an unmapped fairway as rough,
skewing club/aim recommendations toward avoiding rough that was never really
there. `lib/course/dataQuality.ts` (new) adds `assessHoleDataQuality(hole,
features, zones)`, checking each of fairway/greens/bunkers/water against
`aim.ts`'s existing `projectOnLine`/near-hole-line logic: `"mapped"` (OSM),
`"hand-drawn"` (a `UserZone` near this hole), `"estimated"` (fairway only --
no fallback exists for the other three, so they go straight to `"missing"`),
or `"missing"`. A hole card badge (✓/⚠/✗ per surface) sits under the hole
title, with a "Mark X" link (pre-selects that lie in the existing Draw tool)
for anything not mapped. When fairway comes back `"estimated"`,
`estimatedFairwayCorridor(hole, pin)` builds a straight 32yd-wide tee-to-pin
rectangle and it's added to `lies`' `features` (NOT `zones`, so a real
mapped/hand-drawn hazard on top of it still wins -- priority is hand-drawn >
OSM-mapped > this fallback, per the spec). It doesn't follow a dogleg's bend;
labelled "estimated" for exactly that reason.

SG display was rebuilt around actual user confusion ("all red, all
negative", because the old number was Broadie's TOUR baseline, which a
handicap golfer is basically always behind): the club table's "SG" column
and the "Best club" card no longer show that number at all. The table now
shows each club's extra expected strokes **vs the best club on this shot**
(`r.expectedStrokes - best.expectedStrokes`) -- always >= 0, always green,
best club is always +0.00. The "Best club" card's headline is now "Expected
X.XX strokes to hole out" instead of a colored SG badge. The tour-baseline
number still drives every calculation underneath (unchanged), it's just not
shown as the primary UI number anymore.

"Find best aim" had its own honesty problem: it graded its own grid-search
winner on the exact shots that picked it, then LABELLED the result "a little
optimistic" instead of fixing it. `bestAim` (`lib/course/plan.ts`) now splits
a club's shots by index parity into a search half and a holdout half, picks
the best offset using only the search half, then reports the winner's (and
the original aim's) `expectedStrokes` from the holdout half only -- the same
"grade on data the search never touched" fix `aim_point_optimizer.py` already
used for the winner's-curse problem, just without needing fresh real-world
shots (which don't exist for a calibrated golfer's fixed history). Below a
0.05-stroke saving on the holdout half, the UI says "Current aim is already
optimal" instead of moving the aim for noise.

Also added: a "My marks" map toggle (only shown once zones exist) to hide/
show hand-drawn zones separately from the base map, per the spec's Part 3.
7 new tests in `lib/course/course.test.ts` (93 total): data-quality
mapped/estimated/hand-drawn/missing cases, the fallback corridor's priority
against a real hazard, and `bestAim`'s holdout split. Manually verified live
against Rumson GC hole 1 (fairway ⚠ estimated + water ✗ missing, "Mark
fairway"/"Mark water" links open the Draw tool pre-selected) and hole 2 (all
four ✓, no prompts, "Find best aim" correctly says "already optimal").

Confirm-absent for hazards (2026-09-27, same day, later): most holes
genuinely have no water and no bunkers at all, so the "missing" badge/prompt
fired on nearly every hole -- noise, not a real warning. Every hole has SOME
fairway and green, so those two weren't touched; only bunkers and water can
legitimately not exist. `applyConfirmedAbsent(quality, confirmed)` in
`dataQuality.ts` downgrades a `"missing"` status to a new `"confirmed-absent"`
one (renders the same ✓ as mapped, distinct tooltip, click to undo) --
`assessHoleDataQuality` itself is untouched/still pure, the override is
applied in `CourseMapClient`. Confirmations are per-hole, saved on this
device (`golfos.noHazard.<courseId>.v1`, same pattern as the zones cache, not
synced to Supabase -- low-stakes enough not to need it). The "missing" prompt
line now offers "Mark bunkers/water" AND "No bunkers/water here" side by
side. Verified live: confirming, reloading the page, and picking the hole
again all correctly keep it dismissed. 1 new test (95 total) covering the
downgrade and its no-op when the hazard turns out to actually be mapped.

"Best aim" beatable by a manual drag (2026-09-27, same day, later still):
Dillon reported the auto-aim could be beaten by dragging the aim marker
somewhere else by hand -- traced to a real bug in `bestAim` (`plan.ts`), not
missing dimensionality. `evaluateClub` only ever reads the BEARING from the
ball to the aim point (shots land wherever the club's own carry distribution
puts them, never at some nominal "aim distance"), so a literal 2D grid over
aim positions -- what the pasted spec asked for -- would just re-test the
same bearings from scoring-irrelevant distances; skipped it as wasted work
once this was confirmed. The actual bug: turning a "+-N yard" search into an
angle needs a radius, and the code used `ctx.aim`'s (arbitrary, whatever the
on-screen marker happens to be) distance for that radius instead of the
club's own landing distance. Whenever those two differ a lot -- e.g. the aim
marker still sitting near the pin while a much shorter club is being
evaluated, an extremely common case -- the search's real lateral coverage
silently shrank far below its stated +-30 yd, missing improvements a manual
drag could stumble onto. Fixed by using the club's own mean carry as the
radius (proven with a test that fails on the old radius and passes on the
new one -- confirmed by literally reverting the one line and watching it
fail, 29% residual water contact vs <5%). Also widened the default search to
+-60 yd (2 yd steps, same as before) now that the range is finally measuring
something real, and changed the sweep to search outward from 0 yd rather
than left-to-right, so a genuine tie prefers the smallest/least-disruptive
offset instead of whichever end the loop happens to start from. Verified
live: Colts Neck hole 13 (0 mapped fairways, 66 bunkers course-wide -- a
worst-case stress test) and Rumson hole 1 from both the tee and mid-fairway,
both instant (well under a second, no async/caching needed) and correct,
including "already optimal" firing when it should. 2 new tests (96 total).

Auto-optimize aim on load, not just on manual click (2026-09-27, same day,
later still): even after the radius fix above, Dillon reported the *default*
aim shown on load (no click) still lost to a manual drag -- Rumson hole 1
loaded aiming left at 4.1 strokes, a manual drag found 4.05. Root cause: the
optimizer was opt-in only. The aim shown on load was always
`defaultAim`/`defaultTeeAim`, a pure heuristic that never runs through
`bestAim` -- "Find best aim" had to be clicked by hand to get the real
number. Fixed in `CourseMapClient.tsx` with an effect that calls `bestAim`
automatically whenever the golfer's stance (ball, pin, geometry, or the club
being planned for) genuinely changes, tracked in a ref so it only re-runs on
a real change, not every render; a manual drag within an unchanged stance
still persists (falls back to the heuristic default only if the saving is
below the existing 0.05-stroke noise floor). Two bugs caught and fixed before/
during live testing, neither reported by Dillon:
- `pin` was computed inline in the render body (`holePinFor(hole)`,
  unmemoized), sometimes returning a brand-new object via `ringCentroid` --
  would have broken the new effect's `last.pin === pin` change-detection
  (infinite re-runs). Wrapped in `useMemo`, caught before it ever ran live.
- First version of the effect keyed its "did the stance change" check on
  `chosenShots.club`, resolved from the LIVE (possibly manually-dragged) aim.
  Dragging to a deliberately bad bearing could flip which club ranks best at
  that bearing, retriggering the effect, which recomputed from the stable
  heuristic aim and snapped the manual drag back -- a self-created feedback
  loop, found live within minutes of first testing. Fixed with a new
  `autoTargetClub` that always ranks clubs at the STABLE heuristic
  (`defaultAim`), never the live aim, decoupling the effect's trigger from
  any manual-drag side effect.
Verified live: Rumson hole 1 now shows 4.01 automatically on load from the
tee (beats Dillon's manually-found 4.05), re-optimizes correctly on a ball
move, a manual drag to a worse spot persists instead of snapping back, and
"Reset aim" still correctly returns to the heuristic default. 96/96 tests
still passing (pure-function suite, unaffected by this React-only change).
Committed `74541e7`, pushed to `main`.

Mobile layout: map-first, compact UI (2026-09-27, later still): on a phone
the map didn't appear until scrolling ~760px past the full search panel,
golfer settings, course stats and hole strip -- this pass collapses all of
that so the map is visible immediately, per an 8-part spec. All changes are
in `CourseMapClient.tsx` (plus a one-line fade-mask fix in the shared
`SubNav.tsx`) and are CSS/`md:`-breakpoint-driven, matching the file's
existing mobile-vs-desktop pattern, so desktop/tablet (verified unaffected
live) render exactly as before:
- **Sticky one-line header.** Once a course is loaded, a `sticky` bar
  ("Rumson Golf Club · Hole 1 ▾", phones only) sits right below the fixed
  NavBar and replaces the full search/golfer panel, which collapses
  (`setupOpen` state, defaulted collapsed the moment `pickHole` runs). Tap
  it to re-expand. The subtitle under "Course Planner" and the course-wide
  stats pills ("18 holes, 4 greens, ...") are hidden on phones for the same
  reason (pure fluff once the map is what matters) -- the stats moved to a
  tap-to-reveal info icon next to the per-hole data-quality badge instead of
  disappearing outright.
- **Compact toolbar.** Ball/Aim/Pin (and Reset aim, when relevant) stay on
  the toolbar; My location, Follow GPS, Trouble map, Shot rings and My marks
  move behind a phone-only "Layers" button. That dropdown is rendered
  through a React portal straight to `document.body` with viewport-fixed
  coordinates computed from the button's own `getBoundingClientRect()`,
  closed via a `document`-level click listener rather than a visible
  backdrop -- both were necessary fixes, not stylistic choices: the map
  wrapper below establishes its own CSS stacking context (Leaflet's base
  styles put `position:relative` + an explicit `z-index` on
  `.leaflet-container`), which silently painted a same-tree, higher-z-index
  dropdown UNDER the map regardless of the z-index number used, and a
  `fixed inset-0` backdrop button hit the identical problem from the other
  side. Confirmed by literally checking `document.elementFromPoint()` on the
  dropdown's own screen coordinates before concluding a portal was needed,
  not guessing from CSS alone.
- **Club table as a phone-only bottom sheet.** The old single `<aside>`
  (info card + table + "how this is scored") is now `hidden md:block`
  (desktop/tablet, unchanged) plus a `md:hidden` mobile version: the info
  card and "how this is scored" render inline below the map as before, but
  the table itself moves into a `fixed` sheet pinned just above the bottom
  tab bar, collapsed by default to one line ("Driver · 264y · 400 to pin ·
  4.01 strokes"), tapping it toggles `max-height` between that one line and
  ~65vh with its own internal scroll. (The spec's "drag the sheet up/down"
  is tap-to-expand only here -- no drag-gesture library is in this project,
  and adding one felt like scope creep for a collapse/expand toggle that
  already solves the actual problem.) To avoid duplicating ~150 lines of
  JSX between the desktop and phone renders, the info card, the table and
  the scoring details are each a local `const ... = (<>...)` built once from
  the same component state and referenced in both places -- so both copies
  exist in the DOM at once (one hidden by CSS depending on viewport), the
  same tradeoff the file already made elsewhere for its drawing controls
  (a desktop row vs. a floating phone bar).
- **Reserved space for "Find best aim".** Its result paragraph now renders
  inside an always-present `min-h-[2.75rem]` wrapper instead of only
  appearing after a tap, so clicking it doesn't shift the buttons below and
  cause a mis-tap -- true on any screen size, not just phones.
- **Sub-nav scroll affordance.** `SubNav.tsx` (shared by every section) gets
  a right-edge fade (`mask-image`, phones only, cancelled at `md:`) hinting
  there's more to scroll to, since the tabs already scrolled horizontally
  with no visible scrollbar (`no-scrollbar`) and no other affordance.
Verified on an emulated 375x812 phone viewport at Rumson GC hole 1: header
collapse/expand, Layers menu open/close/toggle (Trouble map confirmed
turning on from inside it), bottom sheet collapse/expand showing the full
table, the geometry-count info icon, and "Find best aim" -> "Current aim is
already optimal" all working; then re-verified desktop/tablet unaffected
(full toolbar, no Layers button, no bottom sheet, stats pills visible).
96/96 tests pass (no test-covered logic changed) and the production build
is clean. **One real testing-tool gotcha, not a product bug**: with Chrome's
mobile/touch emulation on, the browser automation tool's synthetic
coordinate clicks silently failed to register on buttons that plain
`element.click()` handled correctly -- confirmed by comparing the same
click at desktop width (worked with the tool) vs. phone width (needed
`.click()`); worth remembering next time a mobile emulation test "does
nothing" for what looks like a real regression.

Course caching + auto-resume + hole-nav stability (2026-09-27, later still):
Dillon's spec asked for a NEW Supabase `course_cache` table (course_id,
name, state, holes jsonb, 30-day expiry) -- **skipped as a real duplicate,
not built**: `course_geometry` (`supabase/course_geometry_cache.sql`,
`lib/supabase/courseCache.ts`) already does exactly this, keyed by
OpenGolfAPI id, and already has an even more deliberate 90-day expiry
("OSM course maps change slowly" -- the comment predates this session).
The device-local `localStorage` geometry cache
(`golfos.course.<id>.v<GEOMETRY_VERSION>`) already uses the spec's own
30-day figure. Building a second, parallel cache table would have meant
two sources of truth for the same data with no clear precedence rule --
worse, not better. What WAS actually missing, and got built:
- **"Refresh course data" button** (`RefreshCw` icon, next to the course
  name) -- the one real gap Part 1 exposed: no manual bypass existed for
  either cache layer. `loadCourse` split into `loadCourse` (full reset: new
  course, clears ball/aim/pin/zones) and a new `fetchGeometry` (just the
  cache-check + fetch + apply half) so the button can call
  `fetchGeometry(course, { force: true })` without touching the golfer's
  current ball/aim/pin -- refreshing mid-round doesn't reset your stance.
  `/api/courses/geometry` takes a new `force=1` param that skips its
  in-memory AND Supabase-read cache layers (write-after-fetch already ran
  unconditionally) -- deliberately does NOT bypass the separate 6-hour raw
  Overpass query cache, since that one exists to protect the shared public
  Overpass servers from repeated hits, not to serve stale data, and a
  golfer mashing "refresh" shouldn't be able to defeat that. Verified live:
  clicking it fires a `force=1` request, ball/hole selection survives it.
- **Recent-course auto-load, real gap**: new `golfos.lastPosition.v1`
  (`{course, holeId}`, naming matches this file's existing
  `golfos.*.v1` convention rather than the spec's suggested
  `golfOS_lastCourse`/`golfOS_lastHole` camelCase keys) saved whenever
  `loadCourse` runs (course) or `pickHole` runs (hole, merged back in via
  `updateLastPositionHole` reading-then-rewriting the stored value rather
  than trusting the live `course` state, which is a stale closure exactly
  during the auto-load-on-mount path). On mount, if a last position exists,
  `loadCourse(last.course, { autoHoleId: last.holeId })` fires
  automatically instead of showing an empty search. Skipped the spec's
  optional "Resume last round?" confirmation chip -- it's explicitly
  optional, and redundant with silent auto-load already doing the useful
  part. Verified live: loaded Rumson hole 5, reloaded the page fresh, and
  it reopened straight to Rumson hole 5 with the ball back on the tee.
- **Hole-navigation layout stability, verified rather than rebuilt**: the
  prior mobile-layout session already made the map a fixed-height box and
  the club table a `fixed`-positioned bottom sheet, both structurally
  immune to content reflow elsewhere on the page -- so "does switching
  clubs shift the map or bottom sheet" was a question to verify, not
  necessarily a bug to fix. Checked directly: captured
  `getBoundingClientRect()` on both the Leaflet container and the bottom
  sheet, clicked through 7 different clubs in the table, and both rects
  were pixel-identical before/after every single switch. No pixel-height
  budget or skeleton-loader lockdown was added, since there was no
  observed shift to lock down.
Typecheck, `npx vitest run` (96/96, untouched by this work), and
`npm run build` all clean.

Map orientation + zoom (2026-09-27, later still): Dillon's spec asked for
the map itself to physically rotate so the hole always faces up (CSS
`transform: rotate()` on the Leaflet container), plus a compass, pinch/
scroll zoom, zoom buttons, min/max zoom, and zoom persistence. **Rotation
was flagged as a real risk before building anything, then dropped at
Dillon's direction** -- Leaflet has no native map-rotation support, and the
spec's own suggested technique (CSS-rotating the container) is a
well-documented broken pattern: Leaflet's click/drag hit-testing works in
the container's own unrotated pixel space, so a CSS-rotated container
computes the WRONG lat/lng for every tap and drag once rotated. That's not
cosmetic here -- ball/aim/pin placement IS the app's core mechanic, so a
rotation bug would silently corrupt strokes-gained numbers, not just look
wrong. Checked the one real alternative (`leaflet-rotate`, which patches
Leaflet's internals to fix this properly): last published to npm 3 years
ago, and its README doesn't document compatibility with a canvas renderer
or draggable markers -- both of which this app depends on. Presented this
tradeoff to Dillon directly (skip rotation / hand-roll corrected click
mapping / adopt the unmaintained plugin) rather than silently picking a
lesser version or silently taking on the risk; he chose to skip rotation
entirely. Everything else shipped in full:
- **Compass** (`CompassOverlay` in `CourseMap.tsx`) -- since the map itself
  doesn't rotate, north is always up already, so a rotating "north needle"
  would carry no information. Repurposed as a static hole-direction
  indicator instead: a yellow arrow showing which way the CURRENT hole
  plays (tee -> green bearing, via the existing `bearingDeg` -- not the
  spec's own flat `atan2(dLng, dLat)` formula, which is a cruder
  small-angle approximation of the same thing `bearingDeg` already gets
  right). Rendered as a plain absolutely-positioned React div, entirely
  outside Leaflet's own DOM/control system -- zero risk of interfering with
  click/drag math, unlike a real map rotation would have been.
- **Zoom**, all built and verified live: `minZoom: 16, maxZoom: 19` (also
  dropped the tile layer's old `maxZoom: 21` over-zoom, which only ever
  produced blurry upscaled tiles past its `maxNativeZoom: 19` anyway, so
  this is a strict quality improvement too); Leaflet's default zoom control
  moved to bottom-right (`L.control.zoom({position:"bottomright"})`),
  confirmed via the control's own `leaflet-bottom leaflet-right` CSS class
  in the live DOM; pinch-to-zoom is Leaflet's own default behavior
  (`touchZoom: true`, unchanged, not independently verifiable through
  browser automation -- no synthetic multi-touch gesture available, so this
  one still wants a real-phone check next time Dillon has the course
  planner open on his own device). Plain scroll-wheel zoom is now enabled
  on desktop and OFF on touch (detected via `ontouchstart`/`maxTouchPoints`,
  same test used elsewhere in this file for coarse-pointer marker sizing) --
  **replaces the previous Ctrl/Cmd+wheel-only convention** (a deliberate
  choice from the original build, made specifically so an embedded map
  wouldn't hijack page-scrolling; Google Maps and most other map embeds use
  that same Ctrl+scroll convention for exactly that reason). Verified live
  with a raw `WheelEvent` dispatched at the map center: zooms 16->17 on a
  non-touch viewport, no-ops (same tile, unchanged) under touch emulation.
  Flagging this explicitly since it's a real, deliberate-choice reversal:
  hovering the map on desktop and scrolling now zooms it instead of
  scrolling the page underneath it -- say if that's not actually wanted
  and it can go back to Ctrl+scroll.
- **Zoom persistence**: `golfos.zoom.<courseId>.v1`, saved on every
  `zoomend`, but only applied as the map's INITIAL view zoom when a course
  first loads -- not reapplied on every hole switch as the literal spec
  asked, since hole switches already call `fitBounds` to frame that hole's
  actual shape, which is a strictly better "sensible default" (the spec's
  own fallback language) than a stale zoom number from a differently-shaped
  hole. Verified the value is written correctly to `localStorage` after
  zooming.
Typecheck, `npx vitest run` (96/96, untouched), and `npm run build` all
clean. Verified live at both desktop and an emulated 375-wide touch
viewport: compass position (8px from the map's top-right corner, measured
via `getBoundingClientRect`, not just eyeballed), zoom-in capping at tile
zoom 19, zoom-out capping at 16 (`leaflet-disabled` class on the button),
scroll-wheel zoom working/not-working exactly per device type, and zoom
value persisting to `localStorage` per course.

Reverted (2026-09-27, later still): Dillon confirmed the Ctrl/Cmd+wheel
convention was the right call after all -- plain scroll-wheel zoom is back
to requiring the modifier, matching the original pre-Session-4 behavior
(and how most embedded maps, Google Maps included, avoid hijacking page
scroll). `scrollWheelZoom: false` + the manual Ctrl/Cmd-checked `wheel`
listener are both back in `CourseMap.tsx`; everything else from Session 4
(compass, zoom min/max, zoom control position, persistence) is unchanged.

Course corrections (2026-09-27, later still): Dillon's spec wanted a way to
fix wrong OpenGolfAPI/OSM course data (its own example: Colts Neck hole 12
tagged Par 3, should be Par 4) globally, for every golfer. Two real
deviations from the literal spec, both because the app's actual data model
doesn't match what the spec assumed:
- **Keyed by `hole_id` (the stable OSM way id, `CourseHole.id`), not
  `hole_number`.** A hole's OSM `ref` tag (the human hole number) can be
  missing; `id` is what the planner already uses everywhere to identify a
  hole, so corrections reuse that instead of introducing a second, weaker
  key.
- **No "round card" integration.** The spec's own test case ("load a new
  round at Colts Neck, hole 12 -- par is 4 on card") assumes a hole-by-hole
  round-logging UI. `rounds` is a single aggregate entry per round (total
  score, total par, course/slope rating) -- there is no per-hole scorecard
  anywhere in this app to wire a corrected per-hole par into. Corrections
  apply everywhere that DOES read per-hole course data today: the map, the
  hole strip's par label, and every strokes-gained calculation that uses
  `hole.par`/the tee position.
`supabase/course_corrections.sql` (applied): `course_key` (same format as
`course_geometry.course_key`), `hole_id`, `field_name` (`par`/`tee_lat`/
`tee_lng`/`yardage`/`handicap`), `original_value`, `corrected_value`,
`reason`, `submitted_by`, `user_id` (owner, `references auth.users`),
unique on `(course_key, hole_id, field_name)`. RLS: public read (anon key,
same as `course_geometry`); insert requires being signed in
(`auth.uid() = user_id`) -- a deliberate floor above the spec's own
"anonymous" option, so a correction is at least tied to an accountable
account, given there's no moderation queue yet; update is open to any
signed-in user (not owner-only), matching the spec's own "global, shared,
latest wins" framing -- this is metadata, not personal data like
`course_zones`, so there's no real owner to protect. Verified live: anon
key can `select` (`[]`... actually returns the real rows, correctly public)
but an `insert` returns `42501` (RLS violation), same verification pattern
used for every other RLS table this project has added.

`lib/course/corrections.ts` (new, pure, tested): `validateCorrection` (par
in {3,4,5,6}; lat/lng in range AND within ~50 miles of the course center,
the spec's own "catch a typo" check; yardage 50-800 -- widened past the
spec's "50-600+" since real par 5s run past 600; stroke index 1-18) and
`applyCorrections(geometry, rows)`, which merges corrections onto
`CourseGeometry.holes` at READ TIME, never baked into any cache layer, so a
new correction is visible on the very next load -- not after the Supabase
cache's 90-day TTL or the in-memory 6h TTL expires. Wired into
`/api/courses/geometry`'s three return paths (memory hit, Supabase hit,
fresh fetch) in `route.ts`. `CourseHole` gained `strokeIndex`, `yardageYds`
(both new fields OSM never tags at all -- null until a golfer corrects
them; the map's own live ball/pin distance is still what scoring actually
uses, this is a scorecard-style display number only) and `correctedFields`
(drives the "corrected" badge). `GEOMETRY_VERSION` bumped 2->3 for the
shape change, so every existing cached row refetches once, correctly, on
its own.

UI: an "Edit" button + a "corrected" badge (hover shows which fields) sit
right on the hole card next to "Hole 12 · Par 4"; `EditHoleModal.tsx` (new,
presentational only -- no Supabase calls of its own) has the par dropdown,
tee lat/lng, yardage, handicap and an optional reason, prefilled from
current values (including any existing correction) and validated inline
via the same `validateCorrection` the route uses. Only fields that
actually changed get submitted -- opening the modal and only typing a
reason submits nothing. On success: `course_corrections` upsert (any
existing row for that hole/field is overwritten, per the "latest wins"
design above), a confirmation toast, and an immediate forced geometry
refetch (`fetchGeometry(course, {force:true})`) so the fix shows up
without a manual page reload -- strictly better than the spec's own
"refresh page" test case. Manually backfilled the Colts Neck hole 12 par
correction Dillon's spec named as the known example (`way/917183416`,
`par` 3 -> 4, attributed to his real account like every other admin
backfill this project has done). Verified live end to end: Colts Neck hole
12 shows "Par 4" + the "corrected" badge on load, survives "Refresh course
data", and the modal's inline validation correctly rejects an out-of-range
latitude before Submit is even clickable. 7 new tests (103 total,
`applyCorrections`/`validateCorrection`), typecheck and `npm run build`
clean.

Session 6a -- 9-hole differential fix + handicap tracking (2026-09-27): the
spec said the 9-hole differential was "off"; the root cause turned out to
be a bug, not a missing feature. `RoundForm`'s `calcDifferential` (score,
courseRating, slopeRating) was already correct and holes-agnostic -- the
USGA formula doesn't need a hole-count adjustment because the rating/slope
*entered* for a 9-hole round already reflect that shorter course (the form
already warns golfers to enter the 9-hole rating/slope, not half the
18-hole numbers). The actual bug was downstream, in a `normalizedDiff()`
helper duplicated in both `app/page.tsx` and `TrendsClient.tsx`, which then
multiplied every partial round's already-correct differential by another
`18/holes_played` (~×2 for 9 holes) before it fed the "best 8 of 20"
handicap estimate or the Trends chart -- silently doubling roughly a third
of Dillon's logged rounds and pushing the estimate to a fictitious ~5 HCP.
Deleted both copies of `normalizedDiff` outright rather than patching them,
since a differential is a differential -- no per-file "normalization" layer
belongs between it and any consumer. Confirmed the fix against Dillon's
real 45 logged rounds before touching any code: best-8-of-last-20 on the
*unscaled* differentials averages to ~2.3 -> ×0.96 = **2.2**, in line with
the spec's own ~2.4 expectation; the pre-fix scaled numbers would have
landed north of 5.

`lib/handicap.ts` (new, pure, tested): `calcDifferential` (moved here
verbatim from `RoundForm`'s local copy, now the single source shared by the
client-side live preview, `app/rounds/actions.ts`, and the dashboard) and
`estimateHandicapIndex(differentials)` -- best 8 of up to the most recent
20 (list must be ordered most-recent-first; returns `null` under 8). One
deviation from the literal spec: relaxed the old dashboard's hard gate of
"needs 20 rounds logged, full stop" to "needs 8 differentials among your
last 20 rounds" -- "last 20 rounds" was never actually a requirement to
*have* 20 rounds, and the old gate meant a golfer with 15 well-logged
rounds saw nothing at all despite having enough for a real USGA-style
estimate.

`app/rounds/actions.ts`: `differential` is now recomputed server-side from
`score`/`course_rating`/`slope_rating` on every save rather than trusted
from the client payload (defense in depth -- a stale or hand-edited value
can no longer make it into a saved round). `createRound` also snapshots
the golfer's most recently tracked `handicap_index` onto the new row
(read from `handicap_tracking`, not recomputed), so handicap progression
over time can be plotted later even as the tracked index moves on;
`updateRound` deliberately leaves an existing snapshot untouched -- editing
a round's putts or notes shouldn't retroactively rewrite history.

`supabase/handicap_tracking.sql` (applied, migration `handicap_tracking`):
new table (`user_id`, `handicap_index numeric(4,1)`, `source` check
`'manual'|'calculated'`, `calculation_date`, `rounds_used`, `notes`),
owner-only RLS (select/insert/delete own rows only -- no update policy,
since a handicap history is an append-only log, not something you edit in
place). `rounds` gained `handicap_index numeric(4,1)` (nullable snapshot)
and `is_9_hole boolean generated always as (holes_played = 9) stored` --
a generated column rather than something the app sets by hand, so it can
never drift out of sync with `holes_played`. Verified RLS the same way as
every other table here: anon key `select` returns `[]` (correctly
filtered, not an error), anon `insert` returns `42501`.

`app/handicap/actions.ts` (new): `recalculateHandicap()` queries the
signed-in user's last 20 rounds (RLS-scoped, no manual `user_id` filter --
same convention as every other action in this app), computes the index via
`estimateHandicapIndex`, and inserts a `source: 'calculated'` row;
`saveManualHandicap(index, notes)` inserts a `source: 'manual'` row for
GHIN or other official numbers. `components/home/HandicapCard.tsx` (new,
client) replaces the dashboard's old always-computed inline block:
shows the latest persisted `handicap_tracking` row if one exists (with its
source and calculation date), falling back to a live "best 8 of loaded
rounds" preview otherwise; "Recalculate" and "Enter manually" (a small
inline form) both disabled with a `title` hint when signed out, matching
`EditHoleModal`'s existing convention. Live-verified signed out: the card
renders "Log at least 8 rated rounds to calculate" with both buttons
visibly disabled; separately verified `previewDifferential` (the client
preview, now backed by the shared `lib/handicap.ts`) against one of
Dillon's actual logged 9-hole rounds (score 40, par 37, rating 35.6, slope
140) and it reproduced the exact stored value, 3.6 -- confirms the shared
calc function behaves identically to the old inline one. Did not sign into
Dillon's real account to exercise "Recalculate" end-to-end or log a test
round, same policy as every prior session: no real credentials, and
inserting a fabricated round would corrupt his actual round history. RLS
and the math were verified instead via anon-key curl and against his real
45 rows directly through the Supabase MCP connection.

8 new tests (`lib/handicap.test.ts` -- differential formula, best-8
selection, the 20-round cutoff, truncation vs. rounding), 111 total.
Typecheck and `npm run build` both clean.

Session 6b -- SG-vs-handicap benchmarks + trends display (2026-09-27): the
spec's premise doesn't hold for this app's actual data. It assumes each
round already carries a per-category strokes-gained number ("get user's SG
for that category from round") to compare against a benchmark table. Real
strokes-gained (the same Broadie/ShotLink methodology `lib/course/cost.ts`
already uses for the Course Planner) needs per-shot distance/lie data --
the Rounds feature only ever logs aggregate box-score stats per round
(fairways%, GIR%, putts, up-and-downs), the same gap Session 5 hit with its
assumed per-hole round card. Built the spec's literal tables/flow anyway,
but `user_sg` is a documented PROXY derived from those box-score stats, not
measured SG -- flagging this prominently rather than quietly presenting an
invented number as real strokes gained.

`lib/sgBenchmarks.ts` (new, pure, tested -- 14 tests): each handicap
bracket's typical fairways%/GIR%/putts-per-18/up-and-down% was researched
(not invented) from public handicap-stat breakdowns -- breakxgolf.com
(fairways%/GIR%), mygolfspy.com (putts/round), practical-golf.com
(up-and-down%, sourced from Broadie's own pros-vs-amateurs analysis) --
replacing the spec's own placeholder seed numbers (its text explicitly
allowed this: "seed with reasonable data ... can refine over time").
Converting a stat GAP into a strokes value uses per-event stroke-cost
estimates reasoned from published ranges (missed fairway ~0.06-0.25 strokes
depending on source, used 0.2; missed green cited anywhere from ~0.3 to
~1.6, used 0.5; failed up-and-down assumed the same order of magnitude) --
these three conversion constants are NOT independently measured for this
app, only reasoned from what's publicly cited, same spirit as the
`APPROX_COURSE_YARDS_PER_DRIVE_YARD` constant `lib/tbox/estimate.ts`
already flags the same way. Putting is the one exact category: a putt
literally is a stroke, so `puttingSg` is a real count (putts taken vs. the
scratch-bracket average for that many holes) with no conversion constant
at all. Every `user_sg`/`benchmark_sg` is measured against the same fixed
scratch-bracket reference point, per-hole-scaled internally so a 9-hole
round earns roughly half the possible swing of an 18 -- deliberately
avoiding the exact "forgot to scale a partial round" bug class Session 6a
just fixed. A round missing a needed stat (e.g. no fairways_pct logged)
simply omits that category rather than guessing.

`supabase/sg_benchmarks.sql` (applied, migrations `sg_benchmarks` +
`round_analysis`): `sg_benchmarks` seeded with the 7-bracket x 4-category
table computed by that same formula (worked arithmetic mirrored in
`lib/sgBenchmarks.test.ts`, so the seed data and the code can never quietly
drift apart), public-read RLS (reference data, no client write path, same
pattern as `golfer_profiles`/`course_geometry`) -- left `sample_size` null
rather than inventing a fake one, since no real sample backs these
estimates. `round_analysis` (owner-only RLS, no update policy) holds one
row per round per category; `app/rounds/actions.ts` computes it on every
`createRound`/`updateRound` by deleting any existing rows for that round
and reinserting fresh ones -- simpler than reconciling partial edits,
cheap at up to 4 rows. Looks up the bracket from the round's *own*
snapshotted `handicap_index` (not today's live number) so an edited old
round is still graded against the handicap the golfer actually had then.
Skips the whole computation (and correctly leaves no rows) when a round or
its owner has no tracked handicap yet, matching the spec's own precondition.

`components/home/TrendsCard.tsx` (new, client): bars per category
(green/red by sign of the last-10-rounds average delta, width proportional
to the delta up to a +/-2-stroke reference scale), a qualitative label
(`qualifierFor` in `lib/sgBenchmarks.ts`), and an explicit disclaimer
line every time it renders -- this is a proxy, not shot-tracked SG. Mobile:
a compact "Your weakest: ..." summary line is always rendered (so nothing
shifts on expand/collapse) with the full 4-bar breakdown behind a
`hidden md:block` toggle, following this app's existing `md:`-breakpoint
convention rather than a second component. Aggregation (last 10 rounds) is
done in `app/page.tsx` with a plain JS reduce over `round_analysis` rows
for those 10 round ids, not a SQL view as the spec offered as an option --
this app has never used a SQL view for this kind of rollup, everything
else in Trends/Rounds/Home aggregates in TS, so a JS reduce matches the
rest of the codebase rather than introducing a new pattern for one card.

Verified: RLS both ways for both new tables via the anon-key technique used
throughout this project (`sg_benchmarks` select succeeds/insert `42501`;
`round_analysis` select returns `[]`/insert `42501`). Manually replayed the
full pipeline against Dillon's real logged box-score stats through the
Supabase MCP connection (read-only SQL, no writes) and confirmed the
numbers come out directionally sensible -- e.g. his 2026-08-22 round (38%
fairways, 33% GIR, 35 putts) scores notably negative across all four
categories against the (2,5) handicap bracket, which matches those being
weak box-score stats for a low-single-digit-handicap round regardless of
what the final score was. Did not sign into his real account to exercise
the actual save-a-round flow end-to-end or populate real `round_analysis`
rows, same policy as every prior session; the empty-state ("Log rounds
with fairways%/GIR%/putts...") was verified live signed-out at both desktop
and an emulated 375px viewport, no console errors, no layout overflow.
The mobile expand/collapse toggle's actual bar rendering could only be
verified indirectly, through the passing `aggregateCategoryTrends`/
`qualifierFor` unit tests and code review against the same `hidden
md:block` pattern this app has used successfully elsewhere -- flagging
this the same way Session 4 flagged pinch-zoom as needing a real check,
since populating it live would require either real account credentials or
fabricated round data, both against this project's standing policy.

14 new tests (`lib/sgBenchmarks.test.ts` -- zero-at-scratch, hand-worked
bracket arithmetic, 9-vs-18-hole scaling, missing-stat omission, up-and-down
rate clamping, bracket lookup, trend aggregation, qualifier thresholds),
125 total. Typecheck and `npm run build` both clean.

Session 6b follow-up -- round_analysis backfill (2026-09-27): Dillon
reported the Strengths & Weaknesses card was empty despite 45 logged
rounds. Root cause: `round_analysis` is only computed inside
`createRound`/`updateRound`, and every existing round predated the
feature, so none had ever triggered it -- a missing backfill, not a logic
bug. Fixed with a one-time script (run once from the repo root with the
service-role key, then deleted -- not committed) that ported
`lib/sgBenchmarks.ts`'s formulas 1:1 to plain JS (no ts-node in this
project), self-checked them against the same values
`lib/sgBenchmarks.test.ts` asserts before touching data, snapshotted the
latest tracked handicap (3.5, his manual entry) onto all 45 rounds, and
wrote 155 `round_analysis` rows. Caveat: every historical round is graded
against that one current handicap, since no round had a historical
snapshot -- the best available approximation for old data; new rounds
snapshot correctly on their own. Last-10-rounds result: Putting +1.17,
Approach -0.01, Off-Tee -0.12, Short Game -0.15 (weakest).

Session 7 -- drill recommendations (2026-09-27): the spec assumed no drill
infrastructure existed, but the app already had two pieces: a per-user
`drills` table (Practice -> Drills, 13 drills in Dillon's account,
categories Full Swing/Wedge/Chipping/Bunker/Putting/Mental, no
instructions/reps/time fields) and the Practice Log, where drills are
logged as `activities` inside `session_blocks`. Built the spec's
`drill_library` + `user_drills` anyway because they're genuinely a
different thing -- a curated, SHARED catalog tagged by strokes-gained
category with instructions/reps/time/equipment, plus a start -> complete
run log -- but kept them explicitly separate from both existing systems
rather than silently merging (merging would mean schema changes to an
existing per-user table and either cluttering the Practice Log with
one-drill sessions or mapping its categories onto SG categories, where
"Full Swing" is ambiguous between off-tee and approach). Consequence worth
knowing: Drill History only shows drills started from a recommendation,
not ones logged in the Practice Log, and recommendations only come from
the curated library, not Dillon's own 13 drills. Both are easy follow-ups
if he wants them unified.

`supabase/drill_library.sql` (applied, migration `drill_library`):
`drill_library` (public-read reference data like `sg_benchmarks`, unique
on `name` so the seed is idempotent, check constraints on category and
difficulty) seeded with 19 drills -- 5 off-tee, 5 approach, 5 short game,
4 putting -- including all 7 of the spec's examples plus standard drills
(start-line gate, wedge distance ladder, clock drill, up-and-down
challenge, etc.), each with a concrete measurable goal. `user_drills`
(owner-only RLS, all four policies like every other personal table;
`completed_at` null = started but not finished; `reps_completed` checked
non-negative).

`lib/drillRecommendations.ts` (new, pure, 7 tests): `weakestCategory`
(most negative last-10-rounds delta -- the SAME aggregate the Strengths &
Weaknesses card shows, so the two cards can never disagree about what's
weakest; the spec's "sort round_analysis rows" wording would have picked
from single-round noise instead) and `recommendDrills` (drills in that
category, never-done first, then least-recently completed, name as
tie-break -- so recommendations rotate as drills get done instead of
always showing the same three; started-but-unfinished runs don't count as
done). `app/drills/library-actions.ts`: `startDrill` (inserts a run,
returns its id) and `completeDrill` (sets `completed_at`, reps, notes;
validates reps server-side too).

UI on Home, under Strengths & Weaknesses (the spec said "trends page",
but the weakness data lives on Home, not `/trends`): `RecommendedDrills`
("Focus area: Short Game (-0.15 SG vs. your 3.5 HCP)", 3 drill cards with
target/reps/time/"Why", a note when every category is already positive),
`DrillModal` (instructions, equipment, Start -> live elapsed timer ->
Complete -> reps + "How did it go?" -> Save; full-screen on phones at
`z-[60]` so it covers the `z-50` nav bars; backdrop-tap only closes it
BEFORE a drill starts, so a mis-tap mid-drill can't strand the run), and
`DrillHistory` (last 50 fetched, 10 shown, category filter chips,
"N completed in the last 30 days", Completed / Not finished status,
collapsible on phones). Phones get a swipeable card row.

Also fixed a latent bug from Session 6a: `HandicapCard` formatted its
timestamp in a client component, which renders once on the server (UTC
on Vercel) and again in the browser (Eastern) -- an evening calculation
would show different dates and trigger a React hydration mismatch.
`DrillHistory` had the same shape, so both now format dates only after
mount.

Verified: RLS both ways for both tables (anon select on `drill_library`
returns all 19; anon insert on either `42501`; anon select on
`user_drills` with the page's exact `drill_library(name, category)` embed
returns `[]` rather than a relationship error, which proves the embed
resolves). Since signed-out Home shows only empty states, rendered the
three cards with realistic fixture props (Dillon's real aggregates, the
real library rows) on a throwaway local route -- deleted afterward,
nothing stored -- and checked by measurement rather than screenshots
(the pane's screenshots kept timing out): 800px -- 3-column grid,
equal-height cards, no overflow; 375px -- no page overflow, swipeable
card row with the next card peeking in, history collapsed by default and
expandable, filters correct (Putting -> 1, Approach -> empty state, All ->
2), modal exactly 375x812 covering the bottom nav with its button
on-screen. Caught and fixed one real layout bug that way: mandatory
scroll-snap pulled the first recommendation card 20px left of the text
above it on phones (`scrollLeft` 20); matching `scroll-px-5` fixes it
(both now at x=37). Pressing Start while signed out returns "Sign in to
log drills." and the modal stays pre-start; `user_drills` confirmed
still at 0 rows afterward. Did not sign in to run the real start ->
complete -> history loop against Dillon's account (no credentials, and
signup/login go to the remote Supabase host, not localhost). 132 tests,
typecheck and `npm run build` clean.

R1 -- cut the app to three tabs (2026-09-28): the spec named the tabs
Play, Rounds, You but not where Play points. Chose `/` (the old Home
page, retitled Play -- it already has Log Round and the Course Planner
promo), with the tab also lit on `/planner`, since the course planner is
the pre-round tool. The Handicap and Strengths & Weaknesses cards stay on
Play (the spec only moved the two drill cards).

- `NavBar.tsx`: one `<nav>` element and one item list instead of a
  duplicated desktop header nav + mobile bottom nav. It is a sibling of
  the `<header>`, not a child, because the header's `backdrop-blur`
  makes it the containing block for `position: fixed` children. On
  desktop the nav is transparent, overlays the top bar, and uses
  `pointer-events-none` on the bar with `-auto` on the links so the logo
  stays clickable. `AccountMenu` was removed from the header ("3
  destinations total") and became `components/auth/AccountCard.tsx` on
  `/you`; the root layout no longer fetches the user.
- `/you`: AccountCard, RecommendedDrills, DrillHistory (moved, with
  DrillModal, from `components/home/` to `components/you/`), and a Your
  Bag list linking to the four tools.
- `/you/bag`: the four former planner sub-pages, now section components
  in `components/bag/` (moved with `git mv`, bodies unchanged). One tool
  renders at a time, picked by `?view=dispersion|compare|custom|tbox`
  from a 4-button in-page switcher (default dispersion, unknown values
  fall back to it), inside `<Suspense key={view}>`. Stacking all four was
  ruled out: Compare alone serializes ~6.9 MB (all 50,600 simulated shots
  for both golfers), Dispersion ~2.2 MB.
- Weakest-category lookup moved to `lib/supabase/loadCategoryTrends.ts`
  so Play's TrendsCard and You's drill focus use the same last-10-rounds
  query and can't disagree.
- Redirects (all 307, verified with curl): `/log`, `/drills`, `/trends`
  -> `/you`; `/planner/{dispersion,compare,custom,tbox}` and the old
  `/simulator/{compare,custom,tbox}` -> `/you/bag?view=...`; `/simulator`
  -> dispersion; `/simulator/course` -> `/planner`.
- Deleted: `app/log/page.tsx` (the Practice Log list with the 3-button
  toolbar), the `/drills` and `/trends` pages, all three practice
  layouts, `app/planner/layout.tsx`, `PracticeSubNav`, `PlannerSubNav`
  and `SubNav` (no other users).
- Kept working but no longer linked from a list: `/log/new` (Play's Log
  Session button; now returns to `/` after saving) and `/log/[id]` (back
  link and delete now go to `/`).

What R1 leaves with no way in (components/actions kept, not deleted, so a
later step can fold them into You): the practice-session list and its CSV
exports (`components/log/ExportButtons`), the personal drills library +
Wedge Numbers (`components/drills/`, `app/drills/actions.ts`), and the
Trends charts + milestones (`components/trends/TrendsClient.tsx`,
`app/trends/actions.ts`). No data was touched -- only the pages.

Verified: all 12 retired URLs redirect to the right place; each bag view
renders its tool with the matching switcher button lit. Measured at
375px: a single Main nav, three equal 125px tabs along the bottom, You
lit on `/you`, no horizontal overflow, every tab hit-testable. At
1400px: tabs right-aligned to the content edge (x=1314) inside the 64px
top bar, the underline at the bar's bottom, Play lit on `/planner`, no
sub-nav, logo clickable through the overlay. No console errors. 132
tests, typecheck and `npm run build` clean (15 routes, down from 20).

Trends on the You page (2026-09-28, follow-up to R1): the Trends page
went away in R1, so it now lives on `/you` as a collapsible card
(`components/you/TrendsPanel.tsx`) above Recommended Drills. Open by
default; a dropdown picks the chart: Handicap over time (default), Round
scores over time, Putts, Fairways hit, Greens in regulation. Each view has
a one-line summary (averages and last-5) and a caption.

- Handicap over time plots `rollingHandicapSeries` (new in
  `lib/handicap.ts`, 3 tests): the estimate as it stood after each round,
  using only rounds up to that point (needs 8 rated rounds). Saved
  `handicap_tracking` entries are overlaid as blue dots. Chosen because
  Dillon has only 2 saved entries, both from 2026-09-27 -- a saved-only line
  would be empty. Both land on his last round, so only the later one (the
  manual 3.5) shows as a dot. The estimate line is the app's simplified
  calculation, not GHIN, and currently reads ~1.0 against his manual 3.5.
- Round scores = the old differential + 5-round average chart, with the
  strokes-vs-par fallback for unrated rounds. Putts = putts/hole bars +
  3-putt % line. Fairways and Greens are single-line % charts.
- Removed as asked: Sessions This Month, the practice-frequency chart, and
  the competitive-breakdown chart. Also dropped, not asked: the
  All/Competitive/Practice filter (competitive-only concept), the four
  stat cards (replaced by the summary line) and the Export Data button
  (Rounds has its own export). Milestone markers are kept: shown on every
  chart, with the add/delete manager at the bottom of the card. Milestone
  actions moved to `app/you/milestone-actions.ts` (revalidates `/you`).
- **Pre-existing bug fixed:** milestone markers never drew, on any chart.
  recharts 3.9 silently drops a `ReferenceLine` on a category axis whose
  labels repeat, and Dillon has same-day rounds (two on 4/22, two on
  4/28). Each round is now its own x position (its index) with the date as
  the tick label; tooltips read the date from the point. Side benefit:
  same-day rounds no longer stack on one x.
- `/you` First Load JS went 167 kB -> 284 kB because recharts now loads
  there. Lazy-loading the panel is the fix if that matters.

Verified by rendering the panel with Dillon's real rounds/handicap/milestone
rows (pulled read-only from Supabase) on a throwaway route, deleted
afterward: all five views draw at 1000px and 375px, the milestone marker
draws on every one, dropdown switching / collapse / reopen produce no
console errors, tooltip shows the date and values, no horizontal overflow,
and the empty state (no rounds) reads correctly. 135 tests, `npm run
build` clean. Not verified: the signed-in `/you` page against the live
database (no credentials) -- the queries are the same RLS-scoped ones the
old Trends page used.

R2 -- design tokens, light/dark, DESIGN.md (2026-09-28): the spec says to
write DESIGN.md from the planning doc's "Design Direction" section, but that
section wasn't in what was pasted and isn't in the repo. DESIGN.md is a
draft describing the system as built, marked as such, to be merged with
that section later.

- Tokens: `app/globals.css` holds every color as RGB-channel CSS variables
  (light in `:root`; dark under `prefers-color-scheme: dark` and under
  `html[data-theme="dark"]` -- two blocks to keep in sync).
  `tailwind.config.ts` maps them to utilities (`bg-surface`, `text-muted`,
  `border-fg/[0.06]`, ...) with opacity support. The old, unused
  `surface/border/accent/muted` config tokens were replaced.
- Codemod (script in scratchpad, not committed) rewrote 47 files: every
  `-[#hex]` class, plus `text-white`/`white/...` borders (they'd be
  invisible in light mode -> `fg` at the same alpha), `text-black` on
  accent buttons -> `on-accent`, and Tailwind palette status colors
  (red/yellow/amber/blue/orange/green) -> `danger/warn/info/viz-orange/accent`.
  Dark values equal the old hex, so dark mode is visually unchanged except:
  the practice-log forms' `#4ade80` button/chip fills and focus borders now
  use the app's standard `#22c55e` (they read as dark green with black
  text in light mode, and the rest of the app already used #22c55e).
- Glass controls over the satellite map keep fixed white/black
  (`text-white`, `text-gray-400`, `bg-black/75`) -- they sit on the photo.
- Non-class colors: `lib/theme/tokens.ts` -- `cssColor` (var() string for
  styles/HTML), `useThemeColor` (concrete values for SVG/recharts
  attributes, re-renders on theme change; older Safari doesn't resolve
  var() in SVG presentation attributes -- unverified on a real iPhone, so
  concrete values were the safe choice), `readColor` (Leaflet layers draw
  on canvas, which can't use var()). Course-map colors are tokens too
  (`--lie-*`, `--map-*`), not themed. `lib/course/heatmap.ts` now returns
  token names (tests updated).
- `lib/brand.ts`: literal hex for manifest, theme-color meta, and the icon,
  which can't read CSS. `app/icon.svg` moved to `public/icon.svg` +
  `metadata.icons`.
- Theme: `<html className="dark">` removed. Follows the system by default;
  You -> Appearance (System/Light/Dark, `components/you/AppearanceSetting.tsx`)
  pins it per device in localStorage `golf-os-theme`; an inline `<head>`
  script applies it before first paint (`suppressHydrationWarning` on html).
- Gradients: body glow and the Play page's Course Planner promo gradient
  removed. Kept the course map's better-to-worse legend (a color-scale key).
  `SubNav.tsx`'s scroll-fade mask no longer exists (deleted in R1). No emoji
  anywhere (spec already confirmed).
- Desktop: Play's Handicap + Strengths & Weaknesses cards sit side by side
  at `lg` (the spec's suggested pass). Also fixed an R1 slip: on `/you/bag`
  the back link and tool switcher shared a line on desktop.

Verified: `grep -rE "#[0-9a-fA-F]{3,6}" app components` returns 0 (was
885). Screenshots in light at 1280px: Play, `/you/bag` dispersion and
compare, Course Planner with Pebble Beach hole 7 loaded (feature layers,
B/P markers, yardage chip, lie-colored shot dots, compass, trouble-map
heat cells, legend), `/log/new`; dark Play matches the old look. Phone
375px light: You page incl. Appearance, no overflow. Toggle: Light while
the system is dark -> page goes light, stored, survives reload (script in
<head> ahead of <body>), Dark pins dark, System clears storage and the
attribute. 135 tests, typecheck, `npm run build` clean.

Known limitation: the iPhone home-screen app keeps
`statusBarStyle: "black-translucent"` (white status-bar text). In light
mode that text sits over the light top bar. iOS can't switch it with the
theme; worth checking on a real device.

R2 follow-up -- Design Direction received (2026-09-28): Dillon pasted the
planning doc's Design Direction section. DESIGN.md now leads with it
verbatim (IA table, visual rules, copy rules), then a "where the app
stands" list of what isn't applied yet, then the token reference.
Tokens changed to match it:
- Light palette is now "paper": page #F7F6F2, near-black ink #1A1A17,
  warm grays, one deep green accent #15602F with white text on it (was
  #16a34a with black). Measured on the page: labels/captions 8.3:1,
  subtitle 7.7:1, primary button 7.65:1, accent link 7.07:1.
- Dark: muted #9CA3AF (was #6B7280, 3.9:1) and fg-3 #B0B6C0, so dark
  labels also clear 7:1 -- labels look brighter in dark than before.
- `faint` is now placeholders/disabled only; its 48 readable uses (old
  #4b5563 captions) became `muted`.
Biggest divergence the list flags: the Direction says Play IS the planner
and the dashboard content moves to You; R1 pointed Play at the old Home
dashboard. Not changed yet -- asked Dillon.

R3 -- Play is the planner, and the Play screen rebuilt (2026-09-28): Dillon
confirmed the Design Direction's IA ("Play opens the planner, like it says").
- Routes: `app/page.tsx` is the planner (moved from `app/planner/page.tsx`);
  `/planner` and `/simulator/course` redirect to `/`. The old Home
  dashboard is gone: Handicap + Strengths & Weaknesses cards moved to
  `/you` (side by side at lg) with the live handicap estimate; the Last
  round / Practice this week / Insight tiles were dropped (Direction bans
  "insights"; Rounds shows the last round). Log Session became a "Log a
  practice session" row on You. `revalidatePath("/")` in handicap, rounds
  and log actions now targets `/you`. "Your Bag" -> "My bag" with golfer
  wording and no per-row icons.
- `CourseMapClient.tsx` (2063 -> ~1930 lines): logic untouched (search,
  geometry, ranking, auto-aim, drawing, GPS); the render half rewritten.
  Deleted: PageHeader + tagline, "How it works" card, the B/A/P + Ctrl/⌘
  sentence, the setup panel, the course-status row, the amber notices, the
  hole strip, the phone-only sticky header. Now one sticky title line
  ("Pebble Beach · Hole 7 · Par 3 · 108", `shortCourseName` strips
  "Golf Links"/"Golf Club"/...) opens a sheet (portal, bottom sheet on
  phones, dialog on desktop, Esc/backdrop close): course search, the
  course's holes as a 6-column grid, Recent, Shots (whose shots / handicap
  inputs), and Course data (counts, the no-boundary / no-holes / no-greens
  notes as plain text, Refresh). Picking a course auto-stands on hole 1.
- Toolbar: Ball/Aim/Pin (text only) + Reset aim + Layers. Layers is the
  same portal menu on every width (the desktop row of 5+ toggles is gone)
  and now also holds "Mark an area" (was a separate select). Phones:
  icon-only 44px buttons; at 375px the row is exactly 343px of 343px, no
  overflow.
- Plan panel: "Best club" hero at 48px semibold tabular + strokes to hole
  out at 36px in accent, To aim / Left / To pin as a hairline row,
  shorter data-quality copy ("Water not mapped. Mark water · None here").
  Shadows removed on the planner's panels.
- First visit: with no remembered position it opens Pebble Beach hole 7
  (`DEFAULT_COURSE`, `DEFAULT_HOLE_REF`); returning users resume as
  before. The mount effect is guarded to run once -- React dev runs mount
  effects twice, and the second pass read back the first pass's "course,
  no hole yet" position and opened hole 1.
- Markers (`CourseMap.tsx`): `markerIcon(kind)` -- white ball with a
  shadow ring, a crosshair (dark under-stroke for contrast on imagery),
  and a flag whose foot is the anchor. No letters. 40px/26px grab boxes.
- **Speed fix:** the page's server render waited ~2.3s on
  `loadCalibratedShots`, which fetched 11 clubs one after another in
  1000-row pages (~33 sequential round trips). Now `Promise.all` across
  clubs (same order, same sampling, same result: 56 (SW) / 3.21 before and
  after). Production build, cleared storage, 375px: recommendation on
  screen at 0.90 / 0.88 / 0.91 s (was 2.3-2.8 s; server response 2.3 s ->
  0.4 s).
- Verified: new-visitor load -> Pebble 7 with best club; sheet -> hole 18
  (Driver 4.70) closes the sheet; search Rumson -> hole 1 (Driver 4.01,
  matches earlier verification), no boundary banner on the map; markers
  are ball/crosshair/flag (DOM check, anchors coincide when aim = pin);
  Layers menu opens above the map; `/planner` redirects; You shows
  handicap, strengths/weaknesses, trends. 135 tests, build clean.
- Known, not changed: a course with no server-cached geometry (Rumson
  after clearing storage) took ~11 s to load on dev -- the existing
  Overpass fetch path, not R3.
- Tooling note: the Browser preview reads `C:/Users/Jeff/Desktop/.claude/launch.json`
  (not the repo's); `golf-os-prod` there runs `next start` on 3001. Don't
  run the dev server while a prod build is being used -- it overwrites `.next`.

Full bags, editable (2026-09-28, after R3): Dillon asked that every club he
carries be scored -- 4- through 9-iron, PW/GW/SW/LW, 7-wood, 3-wood,
driver -- with new golfers defaulting to 5-9 iron, 3-wood, driver and the
four wedges, and bags interchangeable.
- `lib/golfer/bag.ts`: `CLUB_CATALOG` (Driver, 3W, 5W, 7W, 4i-9i, PW, GW,
  SW, LW), `DEFAULT_BAG` (11, new golfers), `CALIBRATED_DEFAULT_BAG` (13,
  Dillon), `canonicalClub` ("56 (SW)" -> SW), `normalizeBag`, and
  `fillBag(measured, bag)`. His calibrated profile has no 4-iron or
  9-iron (too few clean real shots to calibrate: 4i n=7, 9i n=5 after
  filtering), so `fillBag` estimates a missing club from his OWN nearest
  measured club, scaling every shot's carry and offline by the typical
  carry ratio between the two (miss angle preserved): 9i from 8i -> 137
  yd, 4i from 5i -> 190 yd (his 7 raw 4-iron shots average 194). Marked
  "est." in the club table, noted in the hero, and listed in the sheet.
  No database rows were added; the estimate is computed in the browser.
- `lib/golfer/tables.ts`: the handicap model gained 7-Wood and LW so any
  bag can hold them. **Their numbers are assumptions, not sourced** (7W
  carry halfway between 5W and 4i; LW ratio 0.52 of the 7-iron, about 15 yd
  short of SW; dispersion ratios continue the neighbouring trend), commented
  as such. `synthetic_golfer.py` doesn't have them -- the TS port now has
  two clubs the Python source of truth lacks.
- Planner: per-source bags (`bags.calibrated` / `bags.handicap`) saved in
  `golfos.planner.v1`; the sheet's Shots section has a 14-club toggle grid
  ("Bag · N clubs", at least one club). The handicap golfer generates only
  the bag's clubs (1000 shots each).
- 9 new tests (`bag.test.ts`), 144 total. Verified: new visitor on
  Dillon's shots -> 13 rows incl. 9-Iron est. 137 and 4-Iron est. 190;
  "By handicap" -> the 11-club default; adding 7-Wood -> 12 rows, saved,
  survives reload. Build clean.

Hole arrows + collapsed marks (2026-09-28): previous/next hole buttons sit
right after the title line (44px on phones, wrap 18 -> 1 and 1 -> 18,
tooltip names the target hole); "Your marks" under the map is now one
"Your marks · N" toggle, closed by default, holding the mark chips, the
sign-in-to-sync note and the "saved on this device only" prompt. Verified
at 375px (no overflow; 7 -> 8 updates the recommendation; wrap both ways)
and with a guest-mode test mark in the preview browser only (deleted after).

R4 -- You and Rounds (2026-09-28): the spec was written against the old
Home dashboard; R3 had already removed the 3-up stat grid, the duplicate
Log Session / Log Round buttons, "unlock insights" and "no rounds logged
yet", and four of the five SignedOutNotice call sites. Done here:
- **Recalculate button deleted.** `lib/supabase/syncHandicap.ts`
  (`syncCalculatedHandicap`) runs after createRound / updateRound /
  deleteRound: best 8 of last 20 x 0.96, written to handicap_tracking only
  when it changed (`needsNewCalculatedEntry` in lib/handicap.ts, 5 tests),
  never throws (a failed sync can't fail a round save). A new calculation
  supersedes a manual entry as the current index; "Enter manually" stays
  for an official GHIN number. `recalculateHandicap` server action removed.
  Not run against Dillon's account -- his index updates the next time he
  saves a round.
- You: the handicap is the hero (48px semibold, tabular); empty state
  "Needs 8 rated rounds. Add round". Card shadows removed on You/Rounds.
- Rounds: `components/rounds/RoundsSummary.tsx` -- one hero (average
  differential with its rated-round count and competitive/practice split,
  or average score to par when nothing is rated) plus one supporting row
  that only lists stats with data (this month, avg score, fairways,
  greens, penalties/hole). No rounds -> "No rounds yet." + Add round, no
  stats at all. Red/green colouring of scores removed (one accent).
  Export moved into a "⋯" menu beside Add round; ExportLast20Button.tsx
  deleted (logic inlined in RoundsClient).
- Sign-in gated once: `components/auth/SignInBanner.tsx` in the root
  layout, shown signed-out on /rounds and /log only (Play works without an
  account; You has its own sign-in card). The layout reads the session
  from the cookie (getSession, no network). SignedOutNotice.tsx deleted.
- Empty states to the copy rule: "Needs 8 rated rounds." / "Needs rounds
  with stats." / "Needs 2 rounds." / "No putts logged yet." each with an
  Add round link; "No drills yet. Start one above."; em-dashes removed
  from You's copy.
- Verified: RoundsSummary rendered with real rounds on a throwaway route
  (deleted): hero 7.1 = hand-checked mean of 3.6/13/4.8/-1.4/15.5,
  split 15.5 / 5.0, supporting row correct, unrated set falls back to
  "Average score +3.0" with only "This month", 0 dashes. Signed out:
  /rounds has 1 banner + "No rounds yet." and 0 dashes; /you exactly one
  "—" (the handicap hero) and no banner; / no banner. 149 tests, build clean.

R5 -- copy pass (2026-09-28). **Rename on hold:** Dillon is still choosing
a name (thinking along the lines of "lowcap" / "locap", for lowering a
handicap). The name now lives in one constant, `APP_NAME` in
`lib/brand.ts`, read by the NavBar wordmark, layout metadata (title,
applicationName, appleWebApp title) and the manifest; renaming = that
line + `"name"` in package.json. The wordmark is now plain ink (was
"Golf" + green "OS").
- Methodology text moved behind a tap: `components/InfoTip.tsx` (an (i)
  button, 44px target, popover measured on open and shifted to stay inside
  the 16px gutters, closes on outside tap / Escape) on the handicap card,
  Strengths & Weaknesses, and every Trends chart caption.
- Cut the `generate_shots.py --handicap N ...` subtitle. Bag tools renamed
  to golfer words: Your misses / Compare / What if / Which tees (switcher:
  Misses / Compare / What if / Tees), subtitles without "simulated" or
  "dispersion". Route keys (`?view=dispersion` etc.) unchanged.
- 15 mid-sentence em-dashes rewritten (the spec listed 13 with stale line
  numbers; a full sweep found 15 live ones). Standalone "—" placeholders kept.
- "unlock", PlannerSubNav and the old Home were already gone (R1-R4). No emoji.
- Done-check: `grep -rn "Golf OS\|unlock\|generate_shots" app components`
  (UI strings) -> none; "Golf OS" remains only in APP_NAME until the rename.
- Verified with a throwaway route (deleted): info popovers at 375px sit at
  71-359 px, on top, close on Escape/outside tap; bag pages render the new
  titles. 149 tests, build clean.

Trends: handicap chart removed (2026-09-28, Dillon: "looks poor"). The
Trends card now opens on Round scores over time (then Putts, Fairways,
Greens). `rollingHandicapSeries` and its tests deleted (no other users).
Strengths & Weaknesses is collapsible at every width now (was phone-only).

R5.5 -- tee recommendation on Play (2026-09-28):
- `components/simulator/TeeLine.tsx` under the title: fetches
  `/api/courses/[id]/tees` when a course loads and runs `recommendTee()`
  (lib/tbox/estimate.ts, unchanged) with the bag's Driver mean carry (or
  its longest club) and the handicap (tracked index from handicap_tracking,
  now loaded server-side in app/page.tsx; or the planner's handicap setting
  for a handicap golfer). Shows "Play Gold · 6,472 yd" with zero taps plus
  "Longer: Blue" / "Shorter: White" buttons -- one tap switches (saved per
  course in localStorage `golfos.tee.<courseId>.v1`); the line opens a
  sheet listing every tee (yardage, rating/slope, course handicap when a
  handicap is known, "Best fit" marker). No tee data -> "No tee data for
  this course. Enter tees" linking to the manual tool.
- `lib/tbox/tees.ts`: `teeOptionsFrom` (OpenGolfAPI rows -> TeeOptions,
  one per tee, **men's ratings when present** -- the app has no gender
  setting; assumption flagged), `neighbourTees`. 6 tests incl. a real
  Pebble Beach fixture (264-yd driver -> Gold).
- Decision asked for in the spec: **the "Which tees" tool is kept** as the
  manual fallback (hand-entered tees for courses OpenGolfAPI doesn't
  cover), reached from the tee line's empty state, not retired.
- The pick is by length only (recommendTee's own rule; its 25 yd-per-yard
  ratio is still the unsourced approximation flagged in estimate.ts);
  handicap only feeds the course-handicap column.
- Verified on Pebble at 375px and 1280px: zero taps -> Play Gold; one tap
  Shorter -> Playing White (stored); sheet lists Blue/Gold/White/Green/Red.
  152 tests, build clean.

R6 -- onboarding (2026-09-28). Spec facts re-checked: no onboarding
existed; no Capacitor/React Native config (true); icons: `app/icon.svg`
was moved to `public/icon.svg` in R2 and `app/apple-icon.png` +
`public/icons/*` exist -- their artwork waits on the rename (R5, pending).
- **Setup works without an account**, because sign-up can require an
  email confirmation before there's a session -- a friend couldn't reach a
  recommendation in 60 s if setup needed an account first. First visit on
  a device (no `golfos.onboarded.v1`, no account baseline): Play shows one
  line, "Plan with your own clubs. Set up ×".
- `/welcome` (`app/welcome/page.tsx`, `components/welcome/WelcomeClient.tsx`):
  handicap ("Best guess is fine"), Driver + 7-iron carry, "Add more
  clubs" (any catalog club), home course search; Save; then "Got past
  rounds?" -> Add rounds (signed in) / Sign in to add rounds (signed
  out) / Go play. Prefills from the account baseline, else this device's
  setup, else the tracked handicap.
- Storage: `golfer_baseline` table (supabase/golfer_baseline.sql, applied:
  user_id PK, handicap_index, carries jsonb, home_course jsonb; owner-only
  RLS, verified anon select -> [], insert -> 42501). `saveBaseline` server
  action upserts it and records the handicap as a manual handicap_tracking
  entry when it differs from the latest (so You shows it before any rounds).
  `lib/golfer/baseline.ts`: `cleanCarries` (40-400 yd, catalog clubs),
  `cleanHandicap` (-10..54), `bagFor` (default bag + clubs with carries),
  `applyBaselineToDevice` (writes the planner's localStorage: source =
  your clubs, handicap, carries, bag, home course as last position). 6 tests.
- Planner: reads extra carries (`carries` in golfos.planner.v1) into the
  handicap golfer's known carries; the "By handicap" source is now labelled
  "Your clubs", with an "Edit setup" link. A signed-in golfer's account
  baseline is applied the first time Play opens on a new device.
- Login: after sign-in / sign-up with a session, an account without a
  baseline goes to /welcome, otherwise to its redirect. Login's hardcoded
  "Golf OS" wordmark (split across a span, missed by R5's grep) now uses
  APP_NAME. You has a "Your clubs and home course" row -> /welcome.
- Verified (dev, 375px, fresh device, signed out): Set up -> handicap 14,
  driver 240, 7-iron 150, Rumson -> Save -> Go play -> "Rumson · Hole 1 ·
  Par 4 · 400", Driver 4.21 (Dillon's shots give 4.01 there, so it's the
  friend's clubs), tee line "Play White · 6,302 yd", source "Your clubs",
  setup prompt gone. App time 2.8 s end to end; the rest of the 60 s budget
  is a person typing five things. **Not verified: the signed-in path**
  (saveBaseline, the login redirect, cross-device apply) -- no test
  credentials; the table's RLS was verified.

### Hole-by-hole round logging (2026-09-29)

The Add/Edit round form no longer asks for Fairways %, GIR %, Missed
Left/Right % ("from GHIN") or a bare up-and-down count. A round is logged
by tapping through its holes, and the box score is computed from the taps.

- Table `round_holes` (supabase/round_holes.sql): round_id (cascade),
  user_id, hole_number 1-18 (unique per round), par 3-6, strokes,
  fairway_hit (null on par 3s / not tapped), fairway_miss_side
  left|right, green_hit (null = not tapped), green_miss_side
  left|right|long|short, putts (null = not tapped), penalty. Owner-only
  RLS; insert also checks the round belongs to the user.
- `lib/rounds/holes.ts` (5 tests): `cleanHoles` (server validation: par 3
  drops fairway, miss side only with a miss, putts <= strokes),
  `summarizeHoles` -> score, par, holes_played, fairways_pct and
  miss_left/right_pct (share of par-4/5 tee shots, as GHIN shows them),
  gir_pct, total_putts and three_putts (only when every hole has putts),
  up_and_downs = missed greens that still made par or better (scrambling),
  over missed greens, penalties = holes with a penalty. Percentages count
  only holes where that stat was tapped. `upAndDownPct(round)` gives the
  rate for a saved round from up_and_downs + gir_pct (the same way the
  short-game SG proxy reads it).
- `app/rounds/actions.ts`: `createRound`/`updateRound` take a `RoundInput`
  with `holes` (hole by hole) or `score/par/holes_played` (score only).
  The server computes every stat column and the differential; the client
  sends no stats. Holes are replaced delete-then-insert; a new round whose
  holes fail to save is deleted (no half-saved rounds). Score only on a
  round that had holes clears its stats; an older round with typed-in
  stats keeps them. `getRoundHoles` loads holes for editing. SG analysis
  and handicap sync run from the saved row as before.
- Same Round columns, same readers: Rounds summary, RoundCard, Trends
  (fairways/greens/putts charts), round_analysis and You all read what
  they read before. RoundCard now shows whole-number percentages and U&D
  as a rate.
- Form (`components/rounds/RoundForm.tsx`): date, course, then "Hole by
  hole" (default) | "Score only". Hole by hole: 9 | 18, "Thru N · score ·
  +/-", a strip of all holes with their scores, then per hole: Par 3/4/5,
  Score (par-2 .. par+3, then "N+" that counts up), Tee shot Left /
  Fairway / Right (hidden on par 3s), Approach laid out like a green (Long
  above, Left / Green / Right, Short below), Putts 0-4+, Penalty, "Hole
  N+1" (last hole: "Save round"). Tapping a chosen option again clears it.
  Live Fairways / Greens / Putts / Up & down under the hole. All targets
  44 px. Score only: score, par, holes (for past rounds). Rating and slope
  stay (they're on the scorecard). A new round in progress is saved to
  `golfos.roundDraft.v1` on the device and picked up on reopen ("Picked
  up where you left off. Start over"), so it survives mid-round.
- Verified (dev, 375 px): an 18-hole round logged in 94 taps, no typed
  numbers besides the course name; the live line and the saved draft
  matched a hand count (78, +6; fairways 4/14 = 29%; greens 9/18 = 50%;
  up and down 6/9; 33 putts); reload restores the draft; missing holes
  are named and jumped to; signed out, Save gives "Sign in to save
  rounds."; no horizontal scroll; light and dark. **Not verified: a
  signed-in save** (no test credentials).
- Not done: pars aren't prefilled from the course (default 4, one tap to
  change); a 9-hole round is numbered 1-9 even if it was the back nine.
- 2026-09-30: `round_holes` applied (migration `round_holes`). Checked in
  a rolled-back transaction: the owner sees their 2 test holes, another
  user sees 0 and is blocked (42501) from adding holes to that round; anon
  select -> [], anon insert -> 42501.

### Supabase security check (2026-09-30)

- RLS is ON for all 19 public tables (pg_class.relrowsecurity). Private
  tables (rounds, round_holes, handicap_tracking, golfer_baseline,
  round_analysis, milestones, practice_sessions, session_blocks, drills,
  user_drills, course_zones) are owner-only and return [] to the public
  key. Public-read by design: course_geometry, course_corrections,
  drill_library, sg_benchmarks, wedge_reference, golfer_profiles,
  real_shots, simulated_shots (Play shows Dillon's shots signed out).
  course_corrections is also editable by any signed-in user (shared
  course fixes) -- deliberate, revisit if the app gets strangers.
- Passwords are not readable: the auth schema isn't exposed by the API
  (PGRST106) and the admin user list returns 403 to the public key.
- The one security advisor warning is "Leaked Password Protection
  Disabled" -- an Auth setting (reject passwords found in known breaches,
  via HaveIBeenPwned), not a leak. It is a dashboard toggle and can't be
  set from SQL.
- The old schema files (schema.sql, rounds_schema.sql,
  milestones_schema.sql, real_shots_schema.sql,
  simulated_shots_schema.sql) still said `disable row level security`
  from the single-user days; re-running one would have switched RLS off.
  Those lines are gone.

### Keeping score on Play (2026-09-30)

Scoring used to live only behind Rounds -> Add round. Play now has a
"Start round" button under the tee line.

- Start sheet (`components/play/PlayRound.tsx`, `StartRoundSheet`): Tees
  (the course's tees with yardage and rating/slope; preselects the tee
  already picked for the course, else the best fit), Holes (18 | 9 | Other
  with a number), Starting hole (1-18 grid, plus "Start on hole N" for the
  hole the map is on). The footer spells it out before starting: "9 holes:
  10-18 · Gold 36.7 / 137". Courses with no tee data still start; rating
  and slope are asked for at the end.
- `lib/rounds/activeRound.ts` (8 tests): `playOrder(start, count,
  courseHoles)` wraps past the last hole (9 from the 10th = 10..18; 12
  from the 10th = 10..18, 1..3) and never repeats a hole; `holesFor` fills
  each hole's par from the course map data (default 4); `ratingForHoles`
  = the tee's 18-hole rating x holes/18 (an estimate for partial rounds --
  tee data has no 9-hole ratings; slope used as is); `describeOrder`;
  the round is stored on the device in `golfos.activeRound.v1`.
- During a round: the tee line is replaced by a Map | Score switch and
  "Gold · Thru 3 · +2". Score shows the hole strip and the same tap pad as
  the round form (`components/rounds/HolePad.tsx`, extracted and shared)
  for the hole the map is on; "Hole N" moves both the pad and the map.
  The map is hidden with CSS, not unmounted, and gets a resize event when
  it comes back. The title's previous/next arrows follow the round's
  holes (18 -> 10 on a back nine). Reopening the app mid-round returns to
  the round's course; opening another course shows "Round in progress at
  X. Resume".
- Finish: score, to par, holes, Fairways/Greens/Putts/Up & down, rating
  and slope prefilled and editable, differential, "Save round" (or "Save
  N holes" when some have no score, with "Go to hole N"). Saves through
  `createRound` with the holes, so the stats are computed server-side as
  for any hole-by-hole round; the tee goes in the notes ("Gold tees").
  Signed out: "Sign in to save" -- the round stays on the phone. "End
  without saving" asks first.
- RoundForm now keeps a saved round's own hole numbers when editing (a
  back nine shows 10-18, not blank 1-9).
- Verified (dev, 375 px, signed out): 9 holes from the 10th on Pebble
  Beach: pars 4 4 3 4 5 4 4 3 5 prefilled, map jumped to 10, scored all
  nine from the Score tab, title followed each hole, map came back at
  341x485 with tiles, next from 18 -> 10, finish showed 40 (+4), 29% /
  56% / 14 putts / 0/4, rating 36.7, slope 137, differential 2.7 (all
  matching a hand count); reload kept the round; End without saving
  cleared it. **Not verified: the signed-in save from Play.**
- Partial rounds (decided by Dillon, 2026-09-30): see "18-hole
  differentials" below.

### 18-hole differentials for short rounds (2026-09-30)

- `calcDifferential(score, rating, slope, holesPlayed)` now scales a 9-17
  hole round to an 18-hole differential (x 18 / holes played) and gives no
  differential under 9 holes (as WHS). Before, a 9-hole differential was
  about half an 18-hole one and the best-8-of-20 averaged them as equals,
  pulling the estimate low. Official WHS adds an expected 9-hole
  differential from the golfer's index instead; the straight scale was
  Dillon's call. Used by the server save, the round form preview and
  Play's finish screen. 3 tests.
- Existing rounds rescaled (supabase/scale_partial_differentials.sql,
  migration `scale_partial_differentials`): 20 nine-hole rounds and 1
  ten-hole round. Average differential now 7.1 (9 holes) vs 6.8 (18).
  Estimate over the last 20: 2.2 -> 3.0 (his entered index: 3.5). You
  shows the latest handicap_tracking entry (the manual 3.5 from setup)
  until the next round save records the new calculated estimate; no
  tracking row was written by hand.

### GPS filtering and club reset on Play (2026-09-30)

- `lib/course/gps.ts` (7 tests): `judgeFix(track, reading)` -> accept /
  inaccurate / jump. A reading worse than 20 yd never moves the ball. A
  move must fit cart speed (7.5 yd/s, ~15 mph -- not walking pace, since
  most golfers ride) x seconds since the last accepted reading + both
  error radii. A bigger move is a jump; it's believed only after readings
  stay at the new place for 3 s (phone slept through a cart ride), never
  for glitches that disagree with each other.
- Follow GPS uses it; rejected readings show a one-line status under the
  toolbar ("Weak GPS signal (±40 yd). Ball not moved." / "GPS jumped.
  Ball not moved until it settles.") and the menu reads "Following ±25 yd,
  weak". My location now waits up to 10 s for a reading within 20 yd
  ("Finding you… ±65 yd so far"), else says so and leaves the ball.
- Every ball move (tap, drag, GPS) goes through `moveBallTo`, which resets
  the club to the best one; a club picked after a move holds until the
  next move. Before, a club picked on the tee stayed pinned for the
  approach.
- Verified (dev, mocked geolocation): weak first fix ignored; 4 yd walk
  followed; 180 yd jump in 3 s ignored; a different glitch ignored; a
  jump agreeing after 1 s still ignored, after 3.5 s followed; My
  location ignored ±65, took ±12, and after 10 s of ±40 left the ball
  with the message. Club: picked PW -> "Your pick"; tapped the ball
  elsewhere -> "Best club", 145 -> 121 yd; picked 9-iron after -> held.

### Play map clean-up (2026-09-30)

- Phone club list: collapsed it's the chip above the tab bar (z-[1100]);
  open it's full screen (fixed inset-0, z-[1200], covers the map) so all
  13 clubs show with no inner scroll. Tapping a club picks it and closes
  the list; the X or Escape closes it too. (`!mt-0`: the page's space-y-3
  had given the fixed overlay a 12 px top margin.)
- The on-map HUD (Club / To aim / Left / To pin) is gone; the plan card
  under the map is the one place for those numbers, and its "Left" is now
  "Aim to pin" (it was the aim point's distance to the pin, not yards
  left of target).
- Map credits: Leaflet's attribution control now sits bottom-left as a
  9 px light-on-dark label (globals.css, `.leaflet-bottom` for
  specificity over leaflet.css) instead of a full-width white strip.
- Found on the way: on phones the map ran under the fixed tab bar and
  Leaflet's panes (z-index 400) painted over Play / Rounds / You. The map
  box now has `isolate`, so its layers stay inside it.

### You: score chart and drills by category (2026-09-30)

- Trends "Round scores": only Differential and its 5-round average (one
  axis). The grey "Strokes vs Par / hole" fallback line, its right axis
  and its caption are gone; the empty state is now "Needs 2 rated
  rounds." and the caption says short rounds are scaled to 18 holes.
- Recommended Drills: a dropdown (Putting / Approach / Off-Tee / Short
  Game, the weakest marked "(weakest)") in the same style as the Trends
  metric picker. It opens on the weakest category as before; picking
  another shows that category's drills and its own "vs your HCP" line and
  "Why", or "No short game stats yet. Add round" when there's no data for
  it. `app/you/page.tsx` runs `recommendDrills` for all four
  (`DRILL_CATEGORIES` in lib/drillRecommendations.ts). With no round stats
  at all, it opens on Putting instead of hiding the drills.
- Verified with a throwaway fixture page (deleted): legend Differential +
  5-round avg, one y-axis; drills default Approach (weakest, -0.85),
  switching to Putting / Short Game / Off-Tee changes drills and framing.

### Rollout: shots judged where they stop (2026-09-30, session 8)

- `lib/course/roll.ts`: `rollYds(club, landingLie, carry, rng)`. Only the
  tee clubs roll (Dillon: his 7-iron doesn't roll at all, so irons,
  wedges, hybrids and 5/7-wood are scored where they land): Driver 20 yd,
  3-Wood 12 yd on fairway, x the landing lie (fairway/green 1, rough 0.3,
  trees 0.2, bunker/water/OOB 0) x a +-30% seeded spread, capped at a
  quarter of the carry. ESTIMATES (no roll data -- monitors measure
  carry). First version rolled every club (wedge 1 ... long iron 8 yd). `rollToRest` walks
  the roll in 2-yd steps and stops in the first bunker, water or OOB it
  enters. `clubGroup` reads "Driver", "3-Wood", "7-Iron", "PW", "56 (SW)".
- `plan.ts`: `simulateLandings(club, shots, from, bearing, lies, rng)`
  lands each shot at carry, rolls it along its travel direction, and
  scores the REST point and lie. `Landing` keeps carryPoint/carryLie;
  `ClubPlan` adds `meanTotalYds` and `meanRest`, and `lieShare` is by rest
  lie. The roll rng is seeded (`ROLL_SEED`) per evaluation, so every aim
  bearing bestAim tries gets the same roll draws. `seededRng` is now
  exported from lib/dispersion/stats.ts (seededSample uses it).
- Play: dots and shot rings are rest positions; Layers -> "Show carry
  points" (off by default) adds a hollow ring where each shot landed. The
  card's "To aim" is "Aim line", and its line reads "Finishes ~272 yd
  (carry 264), leaves 91 yd." (leaves = pattern's average finish point to
  the pin). The club table has a Total column. "How this is scored"
  explains roll and that the aim marker is a direction for full swings.
- Unchanged: cost tables, the aim search, the trouble map, handicap code.
- Tests: roll.test.ts (12): 0 in water/bunker/OOB, driver > wedge, lie
  factors, +-30% spread, cap, fairway landing short of a bunker stops in
  it, a hazard mid-roll is caught, deterministic for a seed, 264 carry
  finishes ~280 on open fairway, rest-lie share. course.test.ts: no
  expectation moved (green/rough/water landings barely roll); a comment
  says why.
- Seen on Pebble 1 from the tee (Dillon's shots): Driver 264 carry -> 272
  total (most of that pattern lands in rough, a third of the roll), fairway
  share 19% -> 12% as fairway landings run off into rough at the dogleg.


| File | Purpose |
|---|---|
| `synthetic_golfer.py` | The model. `SyntheticGolfer` class + all calibration tables. ~90% of the project. |
| `generate_shots.py` | CLI front end. Flags → golfer → CSV + PNG. |
| `menu.py` | Interactive version; prints the equivalent CLI command so it teaches the flags. |
| `parse_sessions.py` | Reads raw launch-monitor session CSVs into one tidy file. |
| `calibrate.py` | Fits model parameters *from* real shots instead of guessing. |
| `validate_against_reference.py` | Compares output to a reference synthetic dataset. |
| `statistical_analysis.py` | t/KS tests, bootstrap CIs, power analysis, overlap figure, held-out validation. |
| `aim_point_optimizer.py` | Aim-point grid search + paired confirmation + 3-panel hole figure. |
| `aim_point_population.py` | Aim-point study over 200 random golfers per handicap. |
| `reference_data/real_shots.csv` | 589 parsed real shots (451 full), 13 clubs, 23 sessions. |
| `reference_data/dillon_profile.json` | Profile fit from those shots. |
| `reference_data/synthetic_shots_all_clubs_by_handicap.csv` | Reference seed dataset from another source. |

Raw launch-monitor exports live in `C:\Users\Jeff\Desktop\archive\`
(NOT in the repo, must not be deleted — `real_shots.csv` is derived from
them and they carry per-shot spin/club-path detail not yet used).

## How the model works

Four factories build a golfer, all producing the same object:

```python
SyntheticGolfer(skill_level="tour")                      # tier
SyntheticGolfer.from_handicap(8.5)                       # continuous
SyntheticGolfer.from_band("2-4")                         # band label
SyntheticGolfer.from_handicap_and_carries(8, {...})      # + real carries
SyntheticGolfer.from_profile_json("...json")             # fit to real data
```

Per shot:

1. **Carry** — two-piece normal (longer short-side tail), scaled by a
   per-club CV. Mean is preserved by adding back the expected skew and
   mishit losses, so user-entered carries are honored exactly.
2. **Mishit roll** — 3–8% by handicap. A mishit widens *direction*
   spread 2.5× and applies a *one-sided* carry loss. It can never gain
   distance.
3. **Direction, two components** —
   `offline = carry × tan(start_line) + curve`. Start line is an angle
   (scales with club distance); curve is a % of carry (faster swings
   curve more).
4. **Curve→carry link** — signed, so draws fly farther and fades come up
   short. This is what tilts the dispersion ellipse diagonally.
5. **Clamps, applied last** — ceiling at +11% of mean, floor at 1.8 CVs
   below. Both compress excess rather than hard-clipping.

Layered on top: a permanent per-golfer start-line bias, a per-club bias,
and a session drift redrawn every ~60 shots.

## What's evidence-backed vs. assumed

**Strongly evidenced:**
- `offline = carry × tan(start_line) + curve` — verified **three times**
  at r ≈ 0.9998 (565 shots, a fresh 24-shot session, and an independent
  796-shot Kaggle dataset).
- Direction SDs — Broadie's peer-reviewed Golfmetrics driver SDs
  (4.0°/5.4°/6.4°/8.1°), cross-checked against Stagner/Arccos.
- Iron gapping ratios — TrackMan 2024 Tour and Dillon's own data agree
  to 0.001 (5-iron/7-iron ratio 1.128 vs 1.127).
- Negative carry skew — measured −1.46 (6i), −0.64 (7i), −0.57 (SW).
- Carry ceiling/floor — 159 driver shots: worst 91% of mean, best
  +10.8%, nothing beyond ±15%.
- Tour tier — TrackMan published carries, reproduced within ~1 yard.

**Weak / assumed — treat with caution:**
- **Mishit rate, multiplier, carry loss** (3–8%, 2.5×, 0.10σ). No
  published data exists, and range sessions structurally can't validate
  them: real duffs happen on course, not on a mat. This is the weakest
  part of the model.
- **`_CLUB_DISTANCE_RATIO`** — per-club distance consistency comes from
  ONE golfer, because no source breaks distance dispersion out by club.
- **`_DEFAULT_CURVE_CARRY_SLOPE` (−0.20)** — deliberately weak, still
  unverified as a shared constant. Originally flagged because Dillon's
  data and the Kaggle golfer's disagreed on *sign* — but a 2026-09-09
  recheck (see Status: Kaggle-set comparison) found the Kaggle golfer's
  sign flips to match Dillon's (-0.395, inside his real -0.892 to -0.288
  range) once the data is mirrored under a left-handed hypothesis. So
  the disagreement may have been a handedness artifact, not evidence
  that golfers genuinely differ in sign — real handedness data would
  settle it. Calibrated profiles still fit this per golfer regardless,
  which stays the reliable path either way.
- **Carry CV** — varies 3× between Dillon's own sessions (0.014 to
  0.044). The tier value is a compromise, not a measurement.

## Known limitations

- **Fixed 2026-09-09: floor-clamp squash still walled the calibrated
  profile.** The 2026-09-01 mishit-floor fix only exempted shots flagged
  `is_mishit` -- but calibrated profiles (Dillon's, and any real-data
  fit) run `mishit_rate=0` by design, so literally every one of their
  shots went through the *original* tight 0.08 linear squash below the
  floor, still producing a visible horizontal wall (confirmed at exactly
  the floor value, 245.5y for Driver). Root cause turned out deeper than
  the squash *ratio*: **any** fixed-ratio linear squash creates a density
  spike at the floor, because it compresses a wide spread of raw
  deficits into a narrow output band -- tightening or loosening the
  ratio only changes how visible the spike is (tested 0.12, still
  visibly walled), never removes it. Replaced with a smooth exponential
  taper (`floor - scale*(1-exp(-deficit/scale))`) whose derivative
  matches the unclamped side exactly at the floor (=1), so there's no
  seam for density to pile up against. Verified via histogram (smooth,
  unimodal, no spike) and a fresh plot. Required regenerating and
  reseeding both golfers' full bags (~2,200 shots/club, every club now,
  not just the 8 previously "deep" ones -- 24,200 rows for Dillon,
  26,400 for the band-2-4 stand-in).
- **Fixed 2026-09-09 (round 1): dispersion charts wasted most of their
  canvas.** Both `/planner/dispersion` and `/planner/compare` always drew the
  Y-axis from literal 0 (the tee) up to the club's max carry. For a
  163y-average 7-Iron, that's a ~0-200y range where the actual shot
  cluster (roughly 140-180y) only fills the top ~20% of the canvas —
  everything below was empty fairway. Dillon caught it from a
  screenshot. Fixed by windowing the visible range to `[min observed
  carry, max observed carry]` with a small pad, instead of always
  anchoring at the tee — `minCarryYds` prop, gridline step auto-adjusts.
  Verified via DOM inspection (circle cy spread, gridline density) at
  the time — which turned out to be an *incomplete* verification (see
  round 2): it confirmed the Y-window was right but didn't catch that
  the canvas was still often mostly empty for an unrelated reason.
- **Fixed 2026-09-09 (round 2): canvas still wasn't filled or
  centered.** Dillon caught this too, from a live screenshot round 1's
  DOM check missed. Root cause: keeping one shared px/yd scale on both
  axes (so dispersion shape isn't visually stretched) while *also*
  fixing both width and height independently means whichever axis has
  more yards-per-its-own-pixel-budget just sits empty — for Driver,
  offline spread is wide relative to a (now correctly windowed) narrow
  carry span, so the X axis became the binding constraint and most of a
  fixed 720px-tall canvas went unused, with content crammed at the
  bottom. Fixed by deriving canvas height from the data's own aspect
  ratio instead of a fixed number: start from the scale that exactly
  fills the width, size height to match, only clamp for
  extremely tall/short cases (with any clamp-induced slack centered, not
  dumped on one edge). `DispersionCanvas`/`OverlayCanvas` now take
  `maxHeightPx` (a ceiling) instead of a fixed `heightPx`. Verified this
  time with an actual rendered screenshot, not just DOM geometry.
- **Fixed 2026-09-01: mishit floor-clamp bug.** The carry floor clamp
  (worst case ~90% of mean, evidence-backed) was squashing *every*
  below-floor shot back up to within 8% of the floor — including shots
  already flagged `is_mishit`, which have their own dedicated distance-
  loss penalty meant to let a true chunk/thin go meaningfully short.
  The two mechanisms fought each other, producing a visible flat "wall"
  at the bottom of each club's dispersion plot instead of a natural
  tapering tail. Fix: mishit-flagged shots now skip the floor clamp
  (`synthetic_golfer.py`, ~line 771). Verified: worst mishits now land
  64–77% of mean depending on club, instead of all clustering ~88-90%.
  Only affects handicap/band-based generation (mishit_rate > 0) — the
  calibrated (real-data) profile already runs mishit_rate=0 by design,
  so the Supabase-seeded dataset was never affected and needs no re-seed.
- **One golfer.** Several tables rest on Dillon's data alone. Getting
  teammates' launch-monitor sessions is the single highest-value next
  step — it's the only way to tell which measured patterns are *human*
  and which are just *him*.
- **Sand wedge simulates too round** (axis ratio 1.07 vs 1.45 measured),
  so its tilt angle isn't meaningful. Wedges are the weakest club.
- **Partial-shot filter is a heuristic** (85% of the club's P90). It
  can't distinguish a deliberate half-swing from a bad full one, so a
  genuine thin shot occasionally gets excluded.
- **Calibrated fidelity is 0.26 yds carry / 0.81 yds offline SD.** The
  carry number rose from 0.07 when the clamps were tightened — a
  deliberate tradeoff for a realistic short tail.
- `validate_against_reference.py` now shows 8–14 yd gaps. Expected, not
  a regression: the reference dataset came from the same flawed carry
  table whose gapping was corrected.

## Data sources worth pursuing

1. **Teammates' launch-monitor exports** — free, immediate, fixes the
   one-golfer problem. `parse_sessions.py` handles the existing format;
   other monitors need small parser tweaks.
2. **ShotLink Intelligence** — every PGA Tour shot, 38 characteristics,
   free for academic research. Needs a university affiliation; worth
   asking the advisor whether he has a route.
3. **Arccos / Shot Scope Data API** — they integrate with third parties
   (Clippd did). Golf OS is a real app, so worth an email. Critically,
   on-course data captures *real duffs*, which range sessions never do —
   the only way to validate the mishit model.

## Common commands

Run from `golf-os/shot-pattern-simulator/`.

```bash
python menu.py
```
```bash
python generate_shots.py --handicap 8 --carry Driver=250 --carry 7-Iron=160 --n-shots 10000 --show
```
```bash
python generate_shots.py --profile-json reference_data/dillon_profile.json --club Driver --club 7-Iron --n-shots 900 --show
```
```bash
python parse_sessions.py "C:/Users/Jeff/Desktop/archive" --out reference_data/real_shots.csv
```
```bash
python calibrate.py reference_data/real_shots.csv --out reference_data/dillon_profile.json --min-shots 10
```

Useful flags: `--skill-level tour`, `--band 2-4`, `--club X` (repeatable),
`--two-way-miss`, `--club-weight SW=0.7`, `--improve-per-session 0.02`,
`--no-ellipses`, `--seed N`. Dispersion ellipses (90% containment) draw
automatically at ≤5 clubs.

## Working preferences

- Prefers **simplicity over cleverness** — had a self-reported miss-shape
  input and an "ego discount" on entered carries both removed for
  overcomplicating things.
- When he asks for "a prompt," he wants a **ready-to-paste command** with
  his numbers filled in, not code to write.
- **Cite sources and separate measurement from assumption.** He pushes
  back hard on unsourced parameters, and has caught several real bugs by
  eyeballing plots — take those objections seriously and go measure.
- Early-intermediate Python; comfortable with pandas, learning classes
  and git. Explain concepts concretely using his own data.
