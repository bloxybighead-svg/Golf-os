# Shot Pattern Simulator: Handoff

What a new session needs about the Python simulator in this folder. The model
description, validation results and script guide live in the root
[README](../README.md); numeric results are in
[STATISTICAL_ANALYSIS.md](STATISTICAL_ANALYSIS.md).

The simulator exists because dispersion analytics and aim-point optimization
need thousands of shots per player, which no user will hit; real data replaces
simulated data as it is logged.

## What's evidence-backed vs. assumed

**Strongly evidenced:**
- `offline = carry × tan(start_line) + curve` — verified **three times**
  at r ≈ 0.9998 (565 shots, a fresh 24-shot session, and an independent
  796-shot Kaggle dataset).
- Direction SDs — Broadie's peer-reviewed Golfmetrics driver SDs
  (4.0°/5.4°/6.4°/8.1°), cross-checked against Stagner/Arccos.
- Iron gapping ratios — TrackMan 2024 Tour and the author's own data agree
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
  unverified as a shared constant. Originally flagged because the author's
  data and the Kaggle golfer's disagreed on *sign* — but a 2026-09-09
  recheck found the Kaggle golfer's
  sign flips to match the author's (-0.395, inside his real -0.892 to -0.288
  range) once the data is mirrored under a left-handed hypothesis. So
  the disagreement may have been a handedness artifact, not evidence
  that golfers genuinely differ in sign — real handedness data would
  settle it. Calibrated profiles still fit this per golfer regardless,
  which stays the reliable path either way.
- **Carry CV** — varies 3× between the author's own sessions (0.014 to
  0.044). The tier value is a compromise, not a measurement.

## Known limitations

- **One golfer.** Several tables rest on the author's data alone. More
  golfers' launch-monitor sessions are the highest-value next step: they are
  the only way to tell which measured patterns are human and which are just him.
- **Sand wedge simulates too round** (axis ratio 1.07 vs 1.45 measured), so its
  tilt angle is not meaningful. Wedges are the weakest clubs.
- **Partial-shot filter is a heuristic** (85% of the club's P90). It cannot tell
  a deliberate half-swing from a bad full one, so a genuine thin shot is
  occasionally excluded.
- **Calibrated fidelity is 0.26 yd carry / 0.81 yd offline SD.** The carry
  number rose from 0.07 when the clamps were tightened, a deliberate tradeoff
  for a realistic short tail.
- `validate_against_reference.py` shows 8-14 yd gaps. Expected: the reference
  dataset came from an older carry table whose gapping was later corrected.

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
python generate_shots.py --profile-json reference_data/synthetic_profile.json --club Driver --club 7-Iron --n-shots 900 --show
```
```bash
python parse_sessions.py "<path to launch-monitor exports>" --out reference_data/synthetic_shots.csv
```
```bash
python calibrate.py reference_data/synthetic_shots.csv --out reference_data/synthetic_profile.json --min-shots 10
```

Useful flags: `--skill-level tour`, `--band 2-4`, `--club X` (repeatable),
`--two-way-miss`, `--club-weight SW=0.7`, `--improve-per-session 0.02`,
`--no-ellipses`, `--seed N`. Dispersion ellipses (90% containment) draw
automatically at ≤5 clubs.
