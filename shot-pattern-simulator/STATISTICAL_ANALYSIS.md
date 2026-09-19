# Statistical Analysis — Results

Full numeric output from `statistical_analysis.py` and `aim_point_optimizer.py`.
Regenerate anytime with:

```bash
python statistical_analysis.py
python aim_point_optimizer.py
```

Both scripts also write their console output to `statistical_analysis_output.txt`
and `aim_point_optimizer_output.txt` (plain text, same numbers, easy to diff
against a future re-run) and their plots to `output/*.png` (gitignored — local
only, already sent to you as files).

---

## 1. Significance tests: simulated vs real shots

H0 (t-test): the two samples have the same mean.
H0 (KS test): the two samples are drawn from the same distribution — the
stricter check, since it compares the whole shape, not just the mean.
**p < 0.05 → reject H0 → the simulator's output measurably differs from real.**

| club    | n_real | carry t p | carry KS p | carry KS stat | offline t p | offline KS p | offline KS stat |
|---------|-------:|----------:|-----------:|--------------:|------------:|-------------:|----------------:|
| Driver  |    159 |    0.9287 |     0.2940 |        0.0794 |      0.5983 |       0.9236 |          0.0441 |
| 7-Iron  |     62 |    0.9413 |     0.9477 |        0.0648 |      0.8025 |       0.5943 |          0.0965 |
| 56 (SW) |     41 |    0.9497 |     0.3369 |        0.1446 |      0.8461 |       0.5654 |          0.1202 |
| 6-Iron  |     34 |    0.9311 |     0.5203 |        0.1362 |      0.8411 |       0.6108 |          0.1267 |
| GW      |     33 |    0.8513 |     0.9863 |        0.0751 |      0.8885 |       0.9709 |          0.0812 |
| 60 (LW) |     32 |    0.9444 |     0.9932 |        0.0717 |      0.9239 |       0.5092 |          0.1415 |
| 5-Iron  |     21 |    0.8793 |     0.9241 |        0.1135 |      0.9270 |       0.6493 |          0.1543 |
| 7-Wood  |     19 |    0.9357 |     0.7129 |        0.1532 |      0.8724 |       0.8485 |          0.1333 |
| 8-Iron  |     17 |    0.9890 |     0.8685 |        0.1369 |      0.9566 |       0.5687 |          0.1822 |
| 3-Wood  |     11 |    0.9743 |     0.7898 |        0.1840 |      0.9921 |       0.4900 |          0.2384 |
| PW      |     10 |    0.9319 |     0.9227 |        0.1615 |      0.9666 |       0.6247 |          0.2240 |

**Result: 11/11 clubs indistinguishable from real on both carry and offline (all p > 0.05, KS test).**
Every p-value here is comfortably above 0.05 — often well above 0.5 — meaning
there's no evidence the simulator's distribution differs from the real one it's
calibrated to. See `output/distribution_overlap.png` for the visual version
(histograms, Driver + 7-Iron).

---

## 2. Bootstrap 95% confidence intervals

Real shots only, percentile method, 5,000 resamples per club.

| club    | n_real | mean carry | CI lo | CI hi | CI half-width | SD carry | SD CI lo | SD CI hi |
|---------|-------:|-----------:|------:|------:|---------------:|---------:|---------:|---------:|
| Driver  |    159 |      264.0 | 262.3 | 265.9 |            1.8 |     12.0 |     11.0 |     12.9 |
| 7-Iron  |     62 |      162.5 | 161.0 | 163.9 |            1.5 |      5.8 |      4.7 |      6.8 |
| 56 (SW) |     41 |       98.2 |  96.9 |  99.5 |            1.3 |      4.2 |      3.4 |      5.0 |
| 6-Iron  |     34 |      172.6 | 171.0 | 174.1 |            1.6 |      4.7 |      3.6 |      5.6 |
| GW      |     33 |      117.4 | 115.5 | 119.3 |            1.9 |      5.6 |      4.2 |      6.7 |
| 60 (LW) |     32 |       89.1 |  87.9 |  90.4 |            1.2 |      3.6 |      2.7 |      4.3 |
| 5-Iron  |     21 |      182.1 | 180.0 | 184.3 |            2.1 |      5.1 |      3.5 |      6.2 |
| 7-Wood  |     19 |      212.2 | 208.1 | 216.2 |            4.1 |      9.0 |      6.7 |     10.8 |
| 8-Iron  |     17 |      147.8 | 144.6 | 151.0 |            3.2 |      6.7 |      4.5 |      8.2 |
| 3-Wood  |     11 |      243.5 | 237.4 | 248.6 |            5.6 |     10.0 |      5.0 |     13.8 |
| PW      |     10 |      124.0 | 121.0 | 127.0 |            3.0 |      4.8 |      2.9 |      6.0 |
| 4-Iron  |      7 |      194.2 | 188.6 | 199.6 |            5.5 |      7.5 |      3.8 |      9.4 |
| 9-Iron  |      5 |      140.2 | 138.8 | 141.6 |            1.4 |      1.6 |      0.7 |      2.0 |

Note the 9-Iron and 4-Iron rows: their CIs look artificially *tight*, not
because those clubs are well-measured, but because n=5 and n=7 are too small
for the bootstrap itself to explore much variability — see the power analysis
below before trusting a narrow CI at very low n.

---

## 3. Power analysis: how many real shots before the fit means anything?

Subsample increasing real-shot counts from the full real pool, bootstrap the
CI at each size, watch the half-width shrink. Full curve: `output/power_analysis.png`.

**Driver (n_max = 159):**

| n real shots | mean CI half-width (yds) | SD CI half-width (yds) |
|---:|---:|---:|
| 5   | 6.94 | 4.70 |
| 8   | 6.09 | 3.97 |
| 12  | 7.95 | 3.71 |
| 18  | 5.51 | 3.23 |
| 25  | 4.25 | 3.06 |
| 35  | 3.23 | 1.66 |
| 50  | 3.19 | 1.68 |
| 70  | 2.80 | 1.29 |
| 100 | 2.43 | 1.27 |
| 130 | 2.04 | 1.01 |
| 159 | 1.77 | 0.91 |

**7-Iron (n_max = 62):**

| n real shots | mean CI half-width (yds) | SD CI half-width (yds) |
|---:|---:|---:|
| 5  | 5.01 | 2.88 |
| 8  | 5.01 | 2.75 |
| 12 | 3.79 | 2.00 |
| 18 | 3.53 | 1.90 |
| 25 | 2.24 | 1.68 |
| 35 | 1.74 | 1.23 |
| 50 | 1.72 | 1.19 |
| 62 | 1.44 | 1.02 |

**Answer: mean-carry CI half-width drops under ~2 yards around n=25-35 real
shots for an iron, but Driver needs ~100-130** — its higher shot-to-shot
variance means more data is needed to pin down the same precision. Rule of
thumb worth stating plainly to Bryant: **clubs with fewer than ~15-20 real
shots (Dillon's own PW n=10, 3-Wood n=11, 4-Iron n=7, 9-Iron n=5) should be
flagged low-confidence** anywhere a calibrated profile gets shown or used.

---

## 4. Aim-point grid search

**Hole and cost model are illustrative** — no real hole/hazard geometry
exists anywhere in this project. Green guarded by a bunker (left) and water
(right); cost = 1.5-3.0 "strokes" depending on where the ball lands, scaled by
distance to the pin on the green/rough. See `aim_point_optimizer.py`'s
docstring for the exact numbers and why they're a stand-in, not a cited
strokes-gained table.

**Dillon's calibrated profile (tight dispersion), 7-Iron, pin at (0, 165):**
- Aiming straight at the pin: expected **2.634** strokes
- Grid-search optimum: +5yd offline, +0yd carry → expected **2.629** strokes
- Apparent savings: 0.004 strokes/approach (SE 0.011, **t-test p = 0.696**)
- **Not significant** — the apparent edge is smaller than the Monte Carlo
  noise at this sample size. Can't claim aiming off the pin actually helps
  here; either the true cost surface is a flat plateau near the pin, or more
  shots per grid cell are needed to tell.

**Synthetic 22-handicap golfer, same hole:**
- Aiming straight at the pin: expected **2.875** strokes
- Grid-search optimum: -5yd offline, -5yd carry → expected **2.848** strokes
- Apparent savings: 0.027 strokes/approach (SE 0.013, **t-test p = 0.042**)
- **Significant** — a wider-dispersion golfer gets a real, measurable benefit
  from aiming short-left, away from both hazards, instead of at the pin.

Plots: `output/aim_point_grid_search_calibrated.png`,
`output/aim_point_grid_search_wide.png` (both already sent to you).

**Why report a non-significant result at all?** Because the discipline that
produced it — t-testing the grid search's "winner" against the noise before
believing it — is the actual point. A single 1,000-3,000-shot Monte Carlo
estimate per grid cell will always have *some* cell come out on top by chance;
without the t-test, that 0.004-stroke "edge" for Dillon would have been
reported as a real finding when it isn't one.
