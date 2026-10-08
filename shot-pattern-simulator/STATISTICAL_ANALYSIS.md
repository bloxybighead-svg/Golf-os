# Statistical Analysis — Results

Full numeric output from `statistical_analysis.py`, `aim_point_optimizer.py`,
and `aim_point_population.py`. Regenerate anytime with:

```bash
python statistical_analysis.py
python aim_point_optimizer.py
python aim_point_population.py
```

Each script also writes its console output to a `*_output.txt` file (plain
text, easy to diff against a future re-run) and its plots to `output/*.png`
(gitignored — copies of the figures used in the README live in
`../docs/images/`). Plots use a white page with light-gray plot areas.

---

## 1. Significance tests: simulated vs real shots (in-sample)

H0 (t-test): the two samples have the same mean.
H0 (KS test): the two samples are drawn from the same distribution — the
stricter check, since it compares the whole shape, not just the mean.
**p < 0.05 → reject H0 → the simulator's output measurably differs from real.**
Here a *high* p-value is the desired outcome, and "not rejected" is weaker
than "proven equal" (see limitations).

**This section is in-sample**: the profile was fit on these same shots.
Section 5 repeats it on sessions the profile never saw.

| club    | n_real | carry t p | carry KS p | carry KS D | offline t p | offline KS p | offline KS D |
|---------|-------:|----------:|-----------:|-----------:|------------:|-------------:|-------------:|
| Driver  |    159 |    0.9287 |     0.2940 |     0.0794 |      0.5983 |       0.9236 |       0.0441 |
| 7-Iron  |     62 |    0.9413 |     0.9477 |     0.0648 |      0.8025 |       0.5943 |       0.0965 |
| 56 (SW) |     41 |    0.9497 |     0.3369 |     0.1446 |      0.8461 |       0.5654 |       0.1202 |
| 6-Iron  |     34 |    0.9311 |     0.5203 |     0.1362 |      0.8411 |       0.6108 |       0.1267 |
| GW      |     33 |    0.8513 |     0.9863 |     0.0751 |      0.8885 |       0.9709 |       0.0812 |
| 60 (LW) |     32 |    0.9444 |     0.9932 |     0.0717 |      0.9239 |       0.5092 |       0.1415 |
| 5-Iron  |     21 |    0.8793 |     0.9241 |     0.1135 |      0.9270 |       0.6493 |       0.1543 |
| 7-Wood  |     19 |    0.9357 |     0.7129 |     0.1532 |      0.8724 |       0.8485 |       0.1333 |
| 8-Iron  |     17 |    0.9890 |     0.8685 |     0.1369 |      0.9566 |       0.5687 |       0.1822 |
| 3-Wood  |     11 |    0.9743 |     0.7898 |     0.1840 |      0.9921 |       0.4900 |       0.2384 |
| PW      |     10 |    0.9319 |     0.9227 |     0.1615 |      0.9666 |       0.6247 |       0.2240 |

**Result: 11/11 clubs pass the KS test on both carry and offline (all p > 0.05).**
Figure: `distribution_overlap.png` (Driver + 7-Iron histograms, real vs
simulated, using the same simulated draws as this table).

---

## 2. Bootstrap 95% confidence intervals

Real shots only, percentile method, 5,000 resamples per club.

| club    | n_real | mean carry | CI lo | CI hi | half-width | SD carry | SD CI lo | SD CI hi |
|---------|-------:|-----------:|------:|------:|-----------:|---------:|---------:|---------:|
| Driver  |    159 |      264.0 | 262.3 | 265.9 |        1.8 |     12.0 |     11.0 |     12.9 |
| 7-Iron  |     62 |      162.5 | 161.0 | 163.9 |        1.5 |      5.8 |      4.7 |      6.8 |
| 56 (SW) |     41 |       98.2 |  96.9 |  99.5 |        1.3 |      4.2 |      3.4 |      5.0 |
| 6-Iron  |     34 |      172.6 | 171.0 | 174.1 |        1.6 |      4.7 |      3.6 |      5.6 |
| GW      |     33 |      117.4 | 115.5 | 119.3 |        1.9 |      5.6 |      4.2 |      6.7 |
| 60 (LW) |     32 |       89.1 |  87.9 |  90.4 |        1.2 |      3.6 |      2.7 |      4.3 |
| 5-Iron  |     21 |      182.1 | 180.0 | 184.3 |        2.1 |      5.1 |      3.5 |      6.2 |
| 7-Wood  |     19 |      212.2 | 208.1 | 216.2 |        4.1 |      9.0 |      6.7 |     10.8 |
| 8-Iron  |     17 |      147.8 | 144.6 | 151.0 |        3.2 |      6.7 |      4.5 |      8.2 |
| 3-Wood  |     11 |      243.5 | 237.4 | 248.6 |        5.6 |     10.0 |      5.0 |     13.8 |
| PW      |     10 |      124.0 | 121.0 | 127.0 |        3.0 |      4.8 |      2.9 |      6.0 |
| 4-Iron  |      7 |      194.2 | 188.6 | 199.6 |        5.5 |      7.5 |      3.8 |      9.4 |
| 9-Iron  |      5 |      140.2 | 138.8 | 141.6 |        1.4 |      1.6 |      0.7 |      2.0 |

The 9-Iron and 4-Iron CIs look artificially *tight*: with n = 5 and 7 the
bootstrap has too few distinct values to explore much variability.

---

## 3. Power analysis: how many real shots before the fit means anything?

For each n, draw 200 random subsamples of n real shots (without
replacement), bootstrap a 95% CI on each (1,000 resamples), and **average the
half-width over the 200 subsamples** (a single subsample per n, used in an
earlier version, made the curve jagged). Dashed line in the figure = the
textbook half-width 1.96·s/√n. Figure: `power_analysis.png`.

**Driver (n_max = 159, SD = 12.04 yd):**

| n real shots | mean CI half-width (yd) | theory 1.96·s/√n | SD CI half-width (yd) |
|---:|---:|---:|---:|
| 5   | 8.59 | 10.55 | 5.08 |
| 8   | 7.73 |  8.34 | 4.26 |
| 12  | 6.34 |  6.81 | 3.48 |
| 18  | 5.31 |  5.56 | 2.87 |
| 25  | 4.51 |  4.72 | 2.37 |
| 35  | 3.91 |  3.99 | 2.04 |
| 50  | 3.29 |  3.34 | 1.69 |
| 70  | 2.78 |  2.82 | 1.43 |
| 100 | 2.34 |  2.36 | 1.20 |
| 130 | 2.05 |  2.07 | 1.05 |
| 159 | 1.86 |  1.87 | 0.95 |

**7-Iron (n_max = 62, SD = 5.87 yd):**

| n real shots | mean CI half-width (yd) | theory 1.96·s/√n | SD CI half-width (yd) |
|---:|---:|---:|---:|
| 5  | 4.11 | 5.14 | 2.47 |
| 8  | 3.64 | 4.07 | 2.33 |
| 12 | 3.02 | 3.32 | 2.03 |
| 18 | 2.58 | 2.71 | 1.79 |
| 25 | 2.18 | 2.30 | 1.52 |
| 35 | 1.88 | 1.94 | 1.36 |
| 50 | 1.60 | 1.63 | 1.15 |
| 62 | 1.44 | 1.46 | 1.05 |

**Answer.** Mean-carry precision of ±2 yd needs about **35 real shots for a
7-iron** and about **140 for the driver**. This matches the closed form
n ≈ (1.96·s / h)²: (1.96 × 5.87 / 2)² ≈ 33 and (1.96 × 12.04 / 2)² ≈ 139.
Required n scales with the *variance*, so the driver's SD (about twice an
iron's) means about four times the shots. The bootstrap half-width sits
slightly *below* theory at very small n (n ≤ 12), the known small-sample
optimism of the bootstrap, which is one reason clubs with fewer than ~15–20
real shots (the author's PW n = 10, 3-Wood n = 11, 4-Iron n = 7, 9-Iron n = 5)
should be flagged low-confidence.

*Correction:* an earlier version of this document said ~25–35 (iron) and
~100–130 (driver). Those came from one random subsample per n, which was
noisy; the averaged result above replaces them.

---

## 4. Distribution overlap

`distribution_overlap.png` — real vs simulated histograms for Driver and
7-Iron, carry and offline, drawn from the same simulated samples used in
section 1 so the KS p-values in the panel titles match the table.

---

## 5. Held-out validation and uncalibrated baseline

Section 1 tests the model on the data it was fit to. To test whether it
predicts shots it has not seen, whole **sessions** are held out (shots within
a session are correlated): 19 full-swing sessions are shuffled (seed 11) into
5 folds; for each fold the profile is fit on the other 4 folds, 20× as many
shots as the held-out fold has per club are simulated, and the pooled
simulated shots are compared with the pooled held-out real shots.

| club    | held-out n | carry mean diff (sim − real, yd) | carry KS D | carry KS p | offline SD ratio (sim/real) | offline KS D | offline KS p |
|---------|-----------:|---------------------------------:|-----------:|-----------:|----------------------------:|-------------:|-------------:|
| Driver  | 159 | +0.19 | 0.0789 | 0.288 | 1.06 | 0.0711 | 0.412 |
| 7-Iron  |  62 | −0.21 | 0.0944 | 0.638 | 0.83 | 0.1081 | 0.467 |
| 56 (SW) |  41 | −0.66 | 0.2073 | 0.061 | 1.26 | 0.2085 | 0.058 |
| 6-Iron  |  34 | −0.20 | 0.1412 | 0.499 | 0.79 | 0.1397 | 0.513 |
| GW      |  33 | +0.01 | 0.0848 | 0.965 | 1.02 | 0.1030 | 0.863 |
| 60 (LW) |  32 | +0.06 | 0.0750 | 0.991 | 1.30 | 0.2078 | 0.126 |
| 7-Wood  |  19 | −0.42 | 0.1500 | 0.762 | 1.07 | 0.1263 | 0.905 |

**Result: 7/7 testable clubs pass the KS test on both carry and offline on
unseen sessions.** Mean carry is within 0.7 yd for every club. The two
wedges sit near the boundary (56°: p = 0.061 and 0.058; 60° offline D = 0.21),
consistent with wedges being the model's weakest clubs. Six clubs (5-Iron,
8-Iron, 3-Wood, PW, 4-Iron, 9-Iron) could not be held-out tested because too
few shots remain in some training folds or in the pooled test set (65
held-out shots were skipped for that reason). This is an evidence of
generalization *across sessions for one golfer*, not across golfers.

**Baseline — an uncalibrated model that only knows a handicap** (handicap 3.0,
the midpoint of the author's 1.9–4 range), compared with all his full-swing
shots for the 8 clubs the default bag shares with his:

| model | KS carry passes | KS offline passes | notes |
|---|---:|---:|---|
| handicap only | 3 / 8 | 5 / 8 | Driver 23.8 yd short (KS D = 0.63); 3-Wood 25.3 yd short |
| handicap + Driver & 7-Iron carries | 6 / 8 | 5 / 8 | carries fixed, but offline spread runs 1.1–1.6× too wide for irons/wedges (8-Iron and PW offline fail, p < 0.01) |
| **calibrated on other sessions** | **7 / 7** | **7 / 7** | — |

Calibration fixes both distance and, especially, dispersion: a generic 3
handicap is looser than this particular 3-ish handicap on offline distance.

---

## 6. Aim-point grid search

**Hole and cost model are illustrative** — no real hole/hazard geometry exists
anywhere in this project. Green guarded by a kidney-shaped bunker (front-left)
and water (right). Cost = expected strokes **remaining after the ball lands**
(water 3.0, bunker 2.3, green 1.5 + 0.15/yd to pin, rough 2.0 + 0.05/yd to pin);
it does not include the approach shot itself, so ~3.6 strokes from 165 yd
including the approach. These constants are the author's stand-in, not a
cited strokes-gained table, so absolute values are not meaningful; only the
ranking of aim points is.

Method: 11 offline × 5 carry offsets = 55 aim points around the pin, 3,000
simulated 7-iron shots each (the golfer's natural scatter re-centered on the
aim point). The best cell is then **re-tested against aim-at-pin on a fresh
batch of 10,000 shots, paired** (the same shots shifted to each aim point).
The search-sample t-test is kept for reference but is optimistic: the winner
is the best of 55 noisy estimates and is tested on the same shots that picked
it.

**the author's calibrated profile, 7-Iron, pin at (0, 165):**
- Aiming at the pin: expected **2.673** strokes remaining
- Grid-search optimum: **+5 yd right, 0 yd carry** → **2.663**
- Search-sample test: saving 0.011 (SE 0.012, p = 0.368) — underpowered
- **Fresh paired test: saves 0.0236 strokes/approach, 95% CI [0.0142, 0.0329], p < 0.001**
- Why: his natural scatter is centered −3.9 yd left of the aim line (a draw
  bias; SD 9.25 yd). Aiming 5 yd right re-centers it on the pin: green 74.0% →
  77.7%, rough 22.0% → 13.7%, but water 3.2% → 8.4% (6,000-shot check).
- The earlier statement that his tight dispersion showed "no benefit"
  (p = 0.368) was a **power problem**, not evidence of no effect. The effect is
  real but small.

**Synthetic 22-handicap golfer (one random draw, seed 99):**
- Aiming at the pin: **2.877**; best cell −5 yd, −5 yd (short-left) → **2.845**
- Fresh paired test: **saves 0.0366, 95% CI [0.0270, 0.0463], p < 0.001**
- This particular golfer's natural scatter is centered +15.9 yd right (SD
  15.3 yd), so aiming at the pin lands 46.5% of shots in the water; the
  recommended aim cuts that to 37.4%.
- **One random draw is not "the 22 handicap".** Each synthetic golfer carries
  a random personal bias; see the population study below.

Figures: `aim_point_grid_search_calibrated.png` and
`aim_point_grid_search_wide.png` — three panels: whole hole, zoomed view of
the pin vs recommended aim, and the expected-strokes grid. Dots: white =
simulated shots aimed at the pin, yellow = aimed at the recommended point,
magenta diamonds = the golfer's real 7-iron shots.

## 7. Population aim-point study (200 random golfers per handicap)

`aim_point_population.py` repeats the search for 200 random synthetic golfers
at handicaps 3, 10 and 22 (same hole, 7-iron), each confirmed on a fresh
10,000-shot paired sample. Figure: `aim_point_population.png`.

| handicap | median offline SD (yd) | SD of golfers' own bias (yd) | median saving (strokes/approach) | IQR | golfers with significant saving | best aim = pin | aim opposite own bias | corr(bias, aim offset) |
|---:|---:|---:|---:|---|---:|---:|---:|---:|
| 3  | 11.6 | 2.1 | 0.003 | 0.000–0.009 | 25.5% | 23.5% | 97% | −0.78 |
| 10 | 12.9 | 3.7 | 0.017 | 0.011–0.027 | 85.5% | 0.5% | 97% | −0.91 |
| 22 | 15.4 | 6.9 | 0.051 | 0.036–0.083 | 100% | 0% | 100% | −0.97 |

Two findings. (1) **Benefit grows with handicap** (median 0.003 → 0.017 →
0.051 strokes per approach), because wider dispersion puts more shots in
trouble. (2) **The direction of the best aim is set by each golfer's own
miss bias**, not by handicap alone (correlation −0.78 to −0.97 between a
golfer's average miss and the recommended offset), while the *short* aim comes
from this hole's layout (100% of 22-handicaps and 98.5% of 10-handicaps
choose short of the pin; none choose long). The median 22-handicap aims 5 yd
left because the high-handicap tier leans right on average (slice), not
because 22 handicaps always miss right. Effect sizes are small: about
0.05 strokes per approach shot for a 22 handicap on this hole.

---

## Limitations

- One real golfer; calibration tables (e.g. per-club distance ratios) rest on
  his data. The population study uses *synthetic* golfers whose parameters
  come from the model itself, so it shows how the method behaves, not how real
  22 handicaps behave.
- Held-out validation is across sessions for one golfer, not across golfers.
  "Not rejected" is weaker than "equivalent"; several clubs have n of 10–20.
- Hole geometry and stroke costs are placeholders.
- Shots within a session are correlated; the bootstrap and t-tests in
  sections 1–3 treat them as independent, so those CIs are somewhat too tight.
- Mishit behavior is unvalidated, wedges are the weakest clubs, and the
  partial-swing filter is a heuristic.
