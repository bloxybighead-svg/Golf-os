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

### Navigation (2026-09-26)

Four top tabs: Home, Practice (Log / Drills / Trends sub-tabs, URLs unchanged),
Rounds, Course Planner (`/planner` map + sub-tabs Dispersion, Compare golfers,
Custom golfer, Tee box). The old `/simulator/*` URLs redirect (next.config.mjs).
Sub-nav lives in `components/SubNav.tsx` + per-section layouts.

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

## Files

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
