"""Population version of the aim-point study.

aim_point_optimizer.py analyzes ONE golfer per handicap. But every
synthetic golfer carries a random personal direction bias (a draw from a
handicap-dependent distribution), and that bias largely decides which way
the best aim point lies. So "a 22 handicap should aim short-left" from a
single draw is a statement about that one random golfer, not about 22
handicaps in general.

This script repeats the search for MANY random golfers at each handicap
and reports how the recommended aim and the strokes saved are distributed.

For speed it scores shots with a vectorized point-in-polygon test (checked
against the ray-casting scorer in aim_point_optimizer.py), evaluates all 55
aim points on the SAME shots (common random numbers), and then confirms
each golfer's winner on a fresh, paired 10,000-shot batch.

Same illustrative hole and stroke costs as aim_point_optimizer.py -- the
absolute numbers are not course-accurate; the distributions are the point.

Run: python aim_point_population.py
"""

from __future__ import annotations

import sys
import time

import numpy as np
import pandas as pd
import matplotlib
from matplotlib.path import Path
from scipy import stats

matplotlib.use("Agg")
import matplotlib.pyplot as plt

import aim_point_optimizer as A
from synthetic_golfer import SyntheticGolfer

CLUB = "7-Iron"
HANDICAPS = [3, 10, 22]
N_GOLFERS = 200
N_SEARCH = 4000
N_CONFIRM = 10000
COLORS = {3: "#1b6ca8", 10: "#e69f00", 22: "#c0392b"}

_WATER = Path(np.array(A.WATER))
_BUNKER = Path(np.array(A.BUNKER))
_GREEN = Path(np.array(A.GREEN))


def costs_vec(off: np.ndarray, car: np.ndarray) -> np.ndarray:
    """Vectorized twin of aim_point_optimizer.score_shot."""
    pts = np.column_stack([off, car])
    dist = np.hypot(off - A.PIN[0], car - A.PIN[1])
    cost = A.COST_ROUGH_BASE + A.COST_ROUGH_PER_YD * dist
    cost = np.where(_GREEN.contains_points(pts), A.COST_GREEN_BASE + A.COST_GREEN_PER_YD * dist, cost)
    cost = np.where(_BUNKER.contains_points(pts), A.COST_BUNKER, cost)
    cost = np.where(_WATER.contains_points(pts), A.COST_WATER, cost)
    return cost


def check_scorer(n: int = 5000):
    rng = np.random.default_rng(0)
    off, car = rng.uniform(-40, 40, n), rng.uniform(125, 205, n)
    slow = np.array([A.score_shot(o, c) for o, c in zip(off, car)])
    fast = costs_vec(off, car)
    agree = float(np.mean(np.isclose(slow, fast)))
    print(f"Vectorized scorer agrees with ray-casting scorer on {agree * 100:.2f}% of {n:,} random points.")
    return agree


OFFSETS = np.arange(-25, 25.1, 5)
CARRY_OFFSETS = np.arange(-10, 10.1, 5)


def study_golfer(handicap: float, seed: int) -> dict:
    g = SyntheticGolfer.from_handicap(handicap, seed=seed)
    mean_carry = g.club_profiles[CLUB]["mean_carry"]
    base = g.sample_shots(N_SEARCH, clubs=[CLUB])
    b_off, b_car = base.offline_yds.to_numpy(), base.carry_yds.to_numpy()

    grid = np.empty((len(CARRY_OFFSETS), len(OFFSETS)))
    for i, dc in enumerate(CARRY_OFFSETS):
        for j, do in enumerate(OFFSETS):
            grid[i, j] = costs_vec(b_off + do, b_car + (A.PIN[1] + dc - mean_carry)).mean()
    bi, bj = np.unravel_index(np.argmin(grid), grid.shape)
    best_off, best_dc = float(OFFSETS[bj]), float(CARRY_OFFSETS[bi])

    fresh = g.sample_shots(N_CONFIRM, clubs=[CLUB])
    f_off, f_car = fresh.offline_yds.to_numpy(), fresh.carry_yds.to_numpy()
    pin_cost = costs_vec(f_off, f_car + (A.PIN[1] - mean_carry))
    best_cost = costs_vec(f_off + best_off, f_car + (A.PIN[1] + best_dc - mean_carry))
    diff = pin_cost - best_cost
    p = 1.0 if (best_off == 0 and best_dc == 0) else float(stats.ttest_1samp(diff, 0.0).pvalue)
    return {
        "handicap": handicap, "seed": seed,
        "bias_off_yd": float(b_off.mean()), "sd_off_yd": float(b_off.std(ddof=1)),
        "best_off": best_off, "best_carry_offset": best_dc,
        "pin_cost": float(pin_cost.mean()), "saving": float(diff.mean()), "p": p,
    }


def main():
    check_scorer()
    rows = []
    t0 = time.time()
    for h in HANDICAPS:
        for k in range(N_GOLFERS):
            rows.append(study_golfer(h, seed=1000 * h + k))
        print(f"  handicap {h}: {N_GOLFERS} golfers done ({time.time() - t0:.0f}s elapsed)")
    df = pd.DataFrame(rows)
    df.to_csv("output/aim_point_population.csv", index=False)

    print("\n" + "=" * 78)
    print(f"POPULATION AIM-POINT STUDY: {N_GOLFERS} random golfers per handicap, {CLUB}")
    print("=" * 78)
    out = []
    for h, d in df.groupby("handicap"):
        sig = d[(d.p < 0.05) & (d.saving > 0)]
        stayed = ((d.best_off == 0) & (d.best_carry_offset == 0)).mean()
        opposite = (np.sign(d.best_off) == -np.sign(d.bias_off_yd))[d.best_off != 0].mean()
        out.append({
            "handicap": h,
            "median_offline_sd_yd": d.sd_off_yd.median(),
            "sd_of_golfer_bias_yd": d.bias_off_yd.std(),
            "median_pin_cost": d.pin_cost.median(),
            "median_saving": d.saving.median(),
            "iqr_saving": f"{d.saving.quantile(.25):.3f}-{d.saving.quantile(.75):.3f}",
            "pct_significant": 100 * len(sig) / len(d),
            "pct_best_is_pin": 100 * stayed,
            "pct_aim_opposite_bias": 100 * opposite,
            "corr_bias_vs_best_off": float(np.corrcoef(d.bias_off_yd, d.best_off)[0, 1]),
        })
    summary = pd.DataFrame(out).set_index("handicap")
    print(summary.round(3).to_string())
    summary.to_csv("output/aim_point_population_summary.csv")

    # Figure: (a) recommended aim vs the golfer's own bias, (b) strokes saved.
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5.4), facecolor="white")
    rng = np.random.default_rng(0)
    for ax in (ax1, ax2):
        ax.set_facecolor(A.AX_BG)
        ax.grid(color="white", linewidth=1)
        ax.set_axisbelow(True)
        ax.tick_params(colors=A.TEXT)
        for sp in ax.spines.values():
            sp.set_color("#999999")
    for h, d in df.groupby("handicap"):
        ax1.scatter(d.bias_off_yd, d.best_off + rng.uniform(-1, 1, len(d)), s=26, alpha=0.75,
                    color=COLORS[h], edgecolor="white", linewidth=0.4, label=f"handicap {h}")
    ax1.axhline(0, color="#555555", lw=1)
    ax1.axvline(0, color="#555555", lw=1)
    ax1.set_xlabel("golfer's own average miss (mean offline, yd; + = right)", color=A.TEXT)
    ax1.set_ylabel("recommended aim offset from pin (yd; + = right)", color=A.TEXT)
    ax1.set_title("Best aim point mirrors the golfer's own bias", color=A.TEXT)
    ax1.legend(facecolor="white", fontsize=9)

    data = [df[df.handicap == h].saving.to_numpy() for h in HANDICAPS]
    bp = ax2.boxplot(data, tick_labels=[f"handicap {h}" for h in HANDICAPS], patch_artist=True,
                     medianprops=dict(color="black", linewidth=2), showfliers=False)
    for patch, h in zip(bp["boxes"], HANDICAPS):
        patch.set_facecolor(COLORS[h])
        patch.set_alpha(0.75)
    for k, h in enumerate(HANDICAPS, start=1):
        d = df[df.handicap == h]
        ax2.scatter(k + rng.uniform(-0.18, 0.18, len(d)), d.saving, s=14, color="#333333", alpha=0.45, zorder=3)
    ax2.axhline(0, color="#555555", lw=1)
    ax2.set_ylabel("strokes saved per approach by aiming at the recommended point", color=A.TEXT)
    ax2.set_title(f"Benefit grows with handicap ({N_GOLFERS} random golfers each)", color=A.TEXT)
    fig.suptitle(f"Aim-point study across random golfers — {CLUB}, illustrative hole", color=A.TEXT)
    fig.tight_layout()
    fig.savefig("output/aim_point_population.png", dpi=130, facecolor="white")
    print("\nSaved output/aim_point_population.png, output/aim_point_population.csv, output/aim_point_population_summary.csv")


if __name__ == "__main__":
    main()
