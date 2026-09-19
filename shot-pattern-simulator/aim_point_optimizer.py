"""Aim-point optimization: for a given approach shot, is aiming straight
at the pin actually optimal, or does the golfer's own dispersion pattern
mean aiming somewhere else produces a lower EXPECTED score?

HOLE / HAZARD LAYOUT IS ILLUSTRATIVE, NOT A REAL COURSE. No hole/hazard
geometry exists anywhere in this project yet (the browser renderer's
"fairway" is a plain placeholder trapezoid too -- see HANDOFF.md). This
builds a plausible example green guarded by a bunker on one side and
water on the other, using Dillon's real, calibrated 7-Iron profile so
the DISPERSION is real even though the HOLE is not.

STROKE COST MODEL IS ALSO ILLUSTRATIVE. Real strokes-gained baselines
(Broadie-style) exist but this doesn't reproduce them precisely -- the
costs below are a simple, monotonic, directionally-correct stand-in
(green cost grows with distance to pin; bunker/water are flat penalties
water > bunker > rough), good enough to show the OPTIMIZATION WORKS
correctly, not a precise strokes-gained model. Swap in a cited table if
this needs to be presented as more than a demo.

Run: python aim_point_optimizer.py
"""

from __future__ import annotations

import numpy as np
import matplotlib
from scipy import stats

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from synthetic_golfer import SyntheticGolfer


# ---- Hole layout (yards; offline = left/right, carry = distance from tee) ----
PIN = (0.0, 165.0)  # dead center of the green, at the club's real mean carry

GREEN = [(-11, 155), (11, 155), (13, 175), (-13, 175)]  # rough green outline
BUNKER = [(-26, 150), (-12, 150), (-12, 163), (-26, 163)]  # front-left bunker
WATER = [(14, 155), (32, 155), (32, 178), (14, 178)]  # right-side water

# Illustrative stroke costs -- see module docstring.
COST_WATER = 3.0
COST_BUNKER = 2.3
COST_ROUGH_BASE = 2.0
COST_ROUGH_PER_YD = 0.05
COST_GREEN_BASE = 1.5
COST_GREEN_PER_YD = 0.15


def _point_in_polygon(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon -- same algorithm as
    golf-os/lib/dispersion/polygon.ts's pointInPolygon, kept local here so
    this script has no dependency on the Next.js app."""
    inside = False
    n = len(poly)
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[i - 1]
        if (yi > y) != (yj > y):
            x_intersect = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_intersect:
                inside = not inside
    return inside


def score_shot(offline_yds: float, carry_yds: float) -> float:
    """Expected strokes-to-hole-out from this landing spot. Illustrative,
    see module docstring."""
    dist_to_pin = np.hypot(offline_yds - PIN[0], carry_yds - PIN[1])

    if _point_in_polygon(offline_yds, carry_yds, WATER):
        return COST_WATER
    if _point_in_polygon(offline_yds, carry_yds, BUNKER):
        return COST_BUNKER
    if _point_in_polygon(offline_yds, carry_yds, GREEN):
        return COST_GREEN_BASE + COST_GREEN_PER_YD * dist_to_pin
    return COST_ROUGH_BASE + COST_ROUGH_PER_YD * dist_to_pin


def simulate_aim_point(golfer: SyntheticGolfer, club: str, aim_offline: float, aim_carry: float, n_shots: int = 1000):
    """Sample n_shots as if the golfer were aiming at (aim_offline, aim_carry)
    instead of their calibrated aim point (0, mean_carry) -- shift every
    shot by the same amount the aim point is shifted from the calibrated
    center, rather than re-deriving a whole new profile."""
    base = golfer.sample_shots(n_shots=n_shots, clubs=[club])
    profile_mean_carry = golfer.club_profiles[club]["mean_carry"]
    shifted_offline = base.offline_yds + aim_offline
    shifted_carry = base.carry_yds + (aim_carry - profile_mean_carry)
    costs = [score_shot(o, c) for o, c in zip(shifted_offline, shifted_carry)]
    return np.array(costs)


def grid_search(golfer: SyntheticGolfer, club: str, n_shots_per_point: int = 3000):
    offline_offsets = np.arange(-25, 25.1, 5)
    carry_offsets = np.arange(-10, 10.1, 5)

    results = np.zeros((len(carry_offsets), len(offline_offsets)))
    cost_samples = {}  # (i, j) -> raw cost array, kept so we can t-test the winner against "aim at pin"
    for i, d_carry in enumerate(carry_offsets):
        for j, d_offline in enumerate(offline_offsets):
            aim_offline = d_offline
            aim_carry = PIN[1] + d_carry
            costs = simulate_aim_point(golfer, club, aim_offline, aim_carry, n_shots_per_point)
            results[i, j] = costs.mean()
            cost_samples[(i, j)] = costs

    best_idx = np.unravel_index(np.argmin(results), results.shape)
    best_offline = offline_offsets[best_idx[1]]
    best_carry_offset = carry_offsets[best_idx[0]]
    pin_idx = (np.abs(carry_offsets - 0).argmin(), np.abs(offline_offsets - 0).argmin())

    best_costs = cost_samples[best_idx]
    pin_costs = cost_samples[pin_idx]
    se_diff = np.sqrt(best_costs.var(ddof=1) / len(best_costs) + pin_costs.var(ddof=1) / len(pin_costs))
    t_result = stats.ttest_ind(pin_costs, best_costs, equal_var=False)

    return {
        "offline_offsets": offline_offsets,
        "carry_offsets": carry_offsets,
        "expected_cost_grid": results,
        "best_offline_offset": float(best_offline),
        "best_carry_offset": float(best_carry_offset),
        "best_expected_cost": float(results[best_idx]),
        "aim_at_pin_expected_cost": float(results[pin_idx]),
        "savings_se": float(se_diff),
        "savings_t_pvalue": float(t_result.pvalue),
    }


def plot_grid(result: dict, club: str, out_path: str = "output/aim_point_grid_search.png"):
    fig, ax = plt.subplots(figsize=(8, 6), facecolor="#0a0a0a")
    ax.set_facecolor("#0a0a0a")
    im = ax.imshow(
        result["expected_cost_grid"],
        extent=[
            result["offline_offsets"][0], result["offline_offsets"][-1],
            result["carry_offsets"][0], result["carry_offsets"][-1],
        ],
        origin="lower", aspect="auto", cmap="RdYlGn_r",
    )
    plt.colorbar(im, ax=ax, label="expected strokes")
    ax.scatter([0], [0], marker="*", s=300, color="white", edgecolor="black", label="aim at pin", zorder=5)
    ax.scatter(
        [result["best_offline_offset"]], [result["best_carry_offset"]],
        marker="X", s=200, color="#38bdf8", edgecolor="white", label="optimal aim point", zorder=5,
    )
    ax.set_xlabel("Aim offline offset from pin (yds)", color="#9ca3af")
    ax.set_ylabel("Aim carry offset from pin (yds)", color="#9ca3af")
    ax.set_title(f"{club}: expected strokes by aim point\n(bunker left, water right)", color="white")
    ax.tick_params(colors="#9ca3af")
    ax.legend(loc="upper left", fontsize=8)
    fig.tight_layout()
    fig.savefig(out_path, dpi=130, facecolor=fig.get_facecolor())
    print(f"Saved {out_path}")


def report(result: dict, label: str):
    savings = result["aim_at_pin_expected_cost"] - result["best_expected_cost"]
    print(f"\n--- {label} ---")
    print(f"Aiming straight at the pin: expected {result['aim_at_pin_expected_cost']:.3f} strokes")
    print(
        f"Grid-search optimum: {result['best_offline_offset']:+.0f}yd offline, "
        f"{result['best_carry_offset']:+.0f}yd carry from pin "
        f"-> expected {result['best_expected_cost']:.3f} strokes"
    )
    print(
        f"Apparent savings: {savings:.3f} strokes/approach "
        f"(SE of that difference: {result['savings_se']:.3f}, t-test p={result['savings_t_pvalue']:.3f})"
    )
    if result["savings_t_pvalue"] < 0.05:
        print("-> statistically significant: aiming off the pin genuinely helps here.")
    else:
        print(
            "-> NOT statistically significant at this sample size: the apparent optimum could just be "
            "Monte Carlo noise. Either the true cost surface is a flat plateau near the pin (aim-at-pin "
            "is fine), or more shots per grid point are needed to tell -- can't claim a real edge yet."
        )


if __name__ == "__main__":
    club = "7-Iron"

    calibrated = SyntheticGolfer.from_profile_json("reference_data/dillon_profile.json", seed=99)
    print(f"Grid-searching aim point for {club}, pin at {PIN}...")
    result_calibrated = grid_search(calibrated, club, n_shots_per_point=3000)
    report(result_calibrated, "Dillon's calibrated profile (tight dispersion)")
    plot_grid(result_calibrated, f"{club} (Dillon, calibrated)", "output/aim_point_grid_search_calibrated.png")

    # A much wider-dispersion golfer should show a bigger, clearer benefit from
    # aiming away from trouble -- aim-point strategy matters more the less
    # consistent you are, so this is the instructive comparison case.
    wide = SyntheticGolfer.from_handicap(22, seed=99)
    result_wide = grid_search(wide, club, n_shots_per_point=3000)
    report(result_wide, "Synthetic 22-handicap golfer (wide dispersion)")
    plot_grid(result_wide, f"{club} (handicap 22)", "output/aim_point_grid_search_wide.png")
