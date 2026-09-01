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

**Remaining milestones, in order:**
2. Seed into Supabase — `simulated_shots` + `golfer_profiles` tables,
   dispersion percentile SQL, club-distribution-overlap view. Must be
   done in SQL per the project spec.
3. Browser rendering — yards→pixels coordinate transform on the Golf OS
   site, plus the T-box estimator and QA (are sampled points inside the
   polygon?).
4. Aim-point optimization — simulate 1,000 shots per candidate aim
   point, score against hazard costs, grid-search for the optimum.
5. Calibration screen — golfers enter real shots in the app, model
   refits live. Then write the README and make the repo public.

The CSV schema (`club, carry_yds, offline_yds, start_line_deg,
curve_yds, session_id, is_mishit`) is already shaped for step 2's
tables, and `carry_yds`/`offline_yds` are exactly the coordinates step
3's renderer needs.

## Files

| File | Purpose |
|---|---|
| `synthetic_golfer.py` | The model. `SyntheticGolfer` class + all calibration tables. ~90% of the project. |
| `generate_shots.py` | CLI front end. Flags → golfer → CSV + PNG. |
| `menu.py` | Interactive version; prints the equivalent CLI command so it teaches the flags. |
| `parse_sessions.py` | Reads raw launch-monitor session CSVs into one tidy file. |
| `calibrate.py` | Fits model parameters *from* real shots instead of guessing. |
| `validate_against_reference.py` | Compares output to a reference synthetic dataset. |
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
- **`_DEFAULT_CURVE_CARRY_SLOPE` (−0.20)** — deliberately weak. Two
  datasets disagree on the *sign*. Dillon shows draws farther; the
  Kaggle golfer shows the opposite. With ball speed controlled his
  effect shrinks from −0.32 to −0.26 and one club flips. Calibrated
  profiles fit it per club, which is the reliable path.
- **Carry CV** — varies 3× between Dillon's own sessions (0.014 to
  0.044). The tier value is a compromise, not a measurement.

## Known limitations

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
