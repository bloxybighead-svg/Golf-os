"""Aim-point optimization: for a given approach shot, is aiming straight
at the pin actually optimal, or does the golfer's own dispersion pattern
mean aiming somewhere else produces a lower EXPECTED score?

HOLE / HAZARD LAYOUT IS ILLUSTRATIVE, NOT A REAL COURSE. No hole/hazard
geometry exists anywhere in this project yet (the browser renderer's
"fairway" is a plain placeholder trapezoid too -- see HANDOFF.md). This
builds a plausible example green guarded by a bunker on one side and
water on the other, using the author's real, calibrated 7-Iron profile so
the DISPERSION is real even though the HOLE is not.

STROKE COST MODEL IS ALSO ILLUSTRATIVE. Real strokes-gained baselines
(Broadie-style) exist but this doesn't reproduce them precisely -- the
costs below are a simple, monotonic, directionally-correct stand-in
(green cost grows with distance to pin; bunker/water are flat penalties
water > bunker > rough), good enough to show the OPTIMIZATION WORKS
correctly, not a precise strokes-gained model. "Cost" means expected
strokes REMAINING after the ball lands -- it does not include the
approach shot itself. Swap in a cited table if this needs to be
presented as more than a demo.

STATISTICAL NOTE. The grid search picks the best of 55 noisy estimates,
so testing that winner on the SAME shots that picked it is optimistic
("winner's curse"). After the search, the winner and the aim-at-pin cell
are therefore re-evaluated on a fresh, independent batch of shots that
are paired (the same shots re-centered on each aim point), and THAT
paired p-value is the one to quote.

Run: python aim_point_optimizer.py
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import matplotlib
from scipy import stats

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from synthetic_golfer import SyntheticGolfer

FIG_BG = "white"
AX_BG = "#e8e8e8"
TEXT = "#222222"

# ---- Hole layout (yards; offline = left/right, carry = distance from tee) ----
PIN = (0.0, 165.0)  # dead center of the green, at the club's real mean carry


def _organic_ring(cx, cy, rx, ry, harmonics, n=120, rotation=0.0):
    """A closed polygon approximating an ellipse (cx,cy,rx,ry) but with its
    radius perturbed by a few sine harmonics, so it reads as a natural
    green/bunker/water outline instead of a perfect ellipse. `harmonics` is
    a list of (k, amplitude, phase) -- radius multiplier is
    1 + sum(amp * sin(k*theta + phase))."""
    theta = np.linspace(0, 2 * np.pi, n, endpoint=False) + rotation
    mult = np.ones_like(theta)
    for k, amp, phase in harmonics:
        mult += amp * np.sin(k * theta + phase)
    xs = cx + rx * mult * np.cos(theta)
    ys = cy + ry * mult * np.sin(theta)
    return list(zip(xs.tolist(), ys.tolist()))


# Green: gently irregular oval, long axis running away from the tee.
GREEN = _organic_ring(0, 166, 14, 12, harmonics=[(3, 0.05, 0.4), (5, 0.03, 1.7)])

# Bunker: front-left of the green, kidney/peanut-shaped (a strong 2nd
# harmonic pinches the middle into two lobes, like the reference photos).
BUNKER = _organic_ring(
    -20, 154, 9, 7,
    harmonics=[(2, 0.42, 2.6), (3, 0.10, 0.8)],
)

# Water: hugs the whole right side of the hole, wavy natural shoreline
# facing the green, running off the edge of the plotted area.
_water_theta = np.linspace(-1.15, 1.15, 60)
_shore_x = 15 + 2.2 * np.sin(2.3 * _water_theta) + 1.3 * np.sin(5.1 * _water_theta + 0.6)
_shore_y = 166 + 26 * np.sin(_water_theta)
WATER = list(zip(_shore_x.tolist(), _shore_y.tolist())) + [(40, 200), (40, 132)]

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
    """Expected strokes-to-hole-out from this landing spot (strokes
    remaining after the ball lands). Illustrative, see module docstring."""
    dist_to_pin = np.hypot(offline_yds - PIN[0], carry_yds - PIN[1])

    if _point_in_polygon(offline_yds, carry_yds, WATER):
        return COST_WATER
    if _point_in_polygon(offline_yds, carry_yds, BUNKER):
        return COST_BUNKER
    if _point_in_polygon(offline_yds, carry_yds, GREEN):
        return COST_GREEN_BASE + COST_GREEN_PER_YD * dist_to_pin
    return COST_ROUGH_BASE + COST_ROUGH_PER_YD * dist_to_pin


def shift_shots(base: pd.DataFrame, mean_carry: float, aim_offline: float, aim_carry: float):
    """Re-center a golfer's natural scatter on a chosen aim point: every
    shot moves by the same amount the aim point is from the calibrated
    center (0, mean_carry), rather than re-deriving a whole new profile."""
    return base.offline_yds.to_numpy() + aim_offline, base.carry_yds.to_numpy() + (aim_carry - mean_carry)


def costs_at(base: pd.DataFrame, mean_carry: float, aim_offline: float, aim_carry: float) -> np.ndarray:
    off, car = shift_shots(base, mean_carry, aim_offline, aim_carry)
    return np.array([score_shot(o, c) for o, c in zip(off, car)])


def simulate_aim_point(golfer: SyntheticGolfer, club: str, aim_offline: float, aim_carry: float, n_shots: int = 1000):
    base = golfer.sample_shots(n_shots=n_shots, clubs=[club])
    return costs_at(base, golfer.club_profiles[club]["mean_carry"], aim_offline, aim_carry)


def paired_confirmation(golfer: SyntheticGolfer, club: str, best_offline: float, best_carry_offset: float, n_shots: int = 10000):
    """Re-test the grid-search winner against aim-at-pin on a FRESH batch of
    shots (independent of the ones that picked the winner), pairing the two
    aim points on the same shots so shot-to-shot luck cancels."""
    base = golfer.sample_shots(n_shots=n_shots, clubs=[club])
    mean_carry = golfer.club_profiles[club]["mean_carry"]
    pin_costs = costs_at(base, mean_carry, 0.0, PIN[1])
    best_costs = costs_at(base, mean_carry, best_offline, PIN[1] + best_carry_offset)
    diff = pin_costs - best_costs  # positive = aiming at the recommended point is cheaper
    se = diff.std(ddof=1) / np.sqrt(len(diff))
    test = stats.ttest_1samp(diff, 0.0)
    return {
        "n": n_shots,
        "mean_saving": float(diff.mean()),
        "se": float(se),
        "ci95": (float(diff.mean() - 1.96 * se), float(diff.mean() + 1.96 * se)),
        "p": float(test.pvalue),
    }


def grid_search(golfer: SyntheticGolfer, club: str, n_shots_per_point: int = 3000):
    offline_offsets = np.arange(-25, 25.1, 5)
    carry_offsets = np.arange(-10, 10.1, 5)

    results = np.zeros((len(carry_offsets), len(offline_offsets)))
    cost_samples = {}  # (i, j) -> raw cost array, kept so we can t-test the winner against "aim at pin"
    for i, d_carry in enumerate(carry_offsets):
        for j, d_offline in enumerate(offline_offsets):
            costs = simulate_aim_point(golfer, club, d_offline, PIN[1] + d_carry, n_shots_per_point)
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

    confirm = None
    if best_idx != pin_idx:
        confirm = paired_confirmation(golfer, club, float(best_offline), float(best_carry_offset))

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
        "confirm": confirm,
    }


def _draw_hole_art(ax, rng):
    """Paints a top-down aerial-style hole: rough, tree fringe, water,
    bunker, green -- real colors/shapes instead of an abstract cost grid."""
    ax.set_facecolor("#3a6b2e")  # rough / fairway base

    # Tree fringe scattered around the outer edge, like the aerial reference photos.
    for _ in range(140):
        angle = rng.uniform(0, 2 * np.pi)
        dist = rng.uniform(32, 46)
        tx = dist * np.cos(angle)
        ty = 166 + dist * np.sin(angle) * 1.15
        if _point_in_polygon(tx, ty, WATER):
            continue
        r = rng.uniform(1.3, 3.2)
        shade = rng.choice(["#1f4a1a", "#255c1f", "#173a14"])
        ax.add_patch(plt.Circle((tx, ty), r, color=shade, zorder=1, alpha=0.9))

    # Water.
    ax.add_patch(plt.Polygon(WATER, closed=True, facecolor="#1c5f74", edgecolor="#134755", linewidth=1.5, zorder=2))
    for _ in range(8):
        cx = rng.uniform(16, 30)
        cy = rng.uniform(140, 195)
        ax.add_patch(plt.Circle((cx, cy), rng.uniform(1.0, 2.2), facecolor="#2f7a90", alpha=0.35, zorder=2, linewidth=0))

    # Fringe/apron: a slightly larger, darker-green halo just outside the green.
    apron = _organic_ring(0, 166, 16.5, 14.2, harmonics=[(3, 0.05, 0.4), (5, 0.03, 1.7)])
    ax.add_patch(plt.Polygon(apron, closed=True, facecolor="#2f7d2a", edgecolor="none", zorder=3))

    # Green, with a lighter center to suggest mowed turf / contour.
    ax.add_patch(plt.Polygon(GREEN, closed=True, facecolor="#4fae3d", edgecolor="#3a8a2d", linewidth=1.5, zorder=4))
    inner = _organic_ring(0, 166, 8, 6.5, harmonics=[(3, 0.05, 0.4), (5, 0.03, 1.7)])
    ax.add_patch(plt.Polygon(inner, closed=True, facecolor="#5fc04a", edgecolor="none", alpha=0.55, zorder=4))

    # Bunker, sand fill with a stipple texture and darker rim shadow.
    rim = _organic_ring(-20, 154, 9.6, 7.5, harmonics=[(2, 0.42, 2.6), (3, 0.10, 0.8)])
    ax.add_patch(plt.Polygon(rim, closed=True, facecolor="#8a7a4a", edgecolor="none", zorder=5))
    ax.add_patch(plt.Polygon(BUNKER, closed=True, facecolor="#e3d3a0", edgecolor="#c2ab74", linewidth=1.2, zorder=6))
    bx = np.array([v[0] for v in BUNKER])
    by = np.array([v[1] for v in BUNKER])
    for _ in range(90):
        t = rng.uniform(0, 1)
        i = rng.integers(0, len(BUNKER))
        j = (i + 1) % len(BUNKER)
        px = bx[i] * (1 - t) + bx[j] * t + rng.uniform(-3, 3)
        py = by[i] * (1 - t) + by[j] * t + rng.uniform(-2, 2)
        if _point_in_polygon(px, py, BUNKER):
            ax.plot(px, py, ".", color="#c9b585", markersize=2, alpha=0.6, zorder=6)

    # Pin flag.
    ax.plot([PIN[0], PIN[0]], [PIN[1], PIN[1] + 3.2], color="white", linewidth=1.5, zorder=8)
    ax.add_patch(plt.Polygon(
        [(PIN[0], PIN[1] + 3.2), (PIN[0] + 2.1, PIN[1] + 2.6), (PIN[0], PIN[1] + 2.0)],
        closed=True, facecolor="#d62828", edgecolor="white", linewidth=0.5, zorder=8,
    ))
    ax.add_patch(plt.Circle(PIN, 0.35, facecolor="white", edgecolor="black", linewidth=0.8, zorder=8))


def fmt_p(p: float) -> str:
    return "p < 0.001" if p < 0.001 else f"p = {p:.3f}"


# Dot colors: each set of points a reader must tell apart gets its own color.
PIN_CLOUD = "#ffffff"      # simulated shots aimed at the pin
REC_CLOUD = "#ffe14d"      # simulated shots aimed at the recommended point
REAL_DOTS = "#ff2bd6"      # the golfer's actual (real) shots
REC_MARK = "#38bdf8"       # recommended aim point marker


def plot_grid(result: dict, club: str, golfer: SyntheticGolfer, out_path: str, label: str,
              real_shots: pd.DataFrame | None = None, n_dispersion_shots: int = 300):
    """Three-panel figure on a white page:
      1. the whole hole (aerial style) with the simulated dispersion cloud
         at the pin aim point and at the recommended aim point,
      2. a zoomed-in view of the box around the pin and the recommended aim
         point, so the actual-vs-recommended difference is easy to read,
      3. the expected-strokes grid the search actually evaluated.
    If real_shots is given, the golfer's real shots are overlaid in a third
    dot color (re-centered on the pin distance, like the simulated ones)."""
    rng = np.random.default_rng(42)
    mean_carry = golfer.club_profiles[club]["mean_carry"]
    best_dx, best_dy = result["best_offline_offset"], result["best_carry_offset"]
    rec = (best_dx, PIN[1] + best_dy)

    # Same underlying shots shifted to the two aim points, so the only
    # difference between the clouds is where they were aimed.
    base = golfer.sample_shots(n_shots=n_dispersion_shots, clubs=[club])
    pin_off, pin_car = shift_shots(base, mean_carry, 0.0, PIN[1])
    rec_off, rec_car = shift_shots(base, mean_carry, rec[0], rec[1])

    fig = plt.figure(figsize=(19, 7.2), facecolor=FIG_BG)
    gs = fig.add_gridspec(1, 3, width_ratios=[1, 1, 1.2], wspace=0.28)
    ax1 = fig.add_subplot(gs[0])
    ax2 = fig.add_subplot(gs[1])
    ax3 = fig.add_subplot(gs[2])

    # Zoom window: centered between the pin and the recommended point, sized
    # to contain both with margin.
    zc = ((PIN[0] + rec[0]) / 2, (PIN[1] + rec[1]) / 2)
    half = max(10.0, max(abs(rec[0] - PIN[0]), abs(rec[1] - PIN[1])) / 2 + 8)

    def draw_points(ax, big):
        s = 46 if big else 12
        ax.scatter(pin_off, pin_car, s=s, color=PIN_CLOUD, edgecolor="#333333", linewidth=0.4, alpha=0.85, zorder=7)
        ax.scatter(rec_off, rec_car, s=s, color=REC_CLOUD, edgecolor="#7a6a00", linewidth=0.4, alpha=0.9, zorder=7)
        if real_shots is not None:
            r_off = real_shots.offline_yds.to_numpy()
            r_car = real_shots.carry_yds.to_numpy() + (PIN[1] - mean_carry)
            ax.scatter(r_off, r_car, s=s * 1.6, marker="D", facecolor="none", edgecolor=REAL_DOTS, linewidth=1.3, zorder=8)
        ax.scatter([PIN[0]], [PIN[1]], marker="*", s=520 if big else 260, color="white", edgecolor="black", linewidth=1.2, zorder=10)
        ax.scatter([rec[0]], [rec[1]], marker="X", s=330 if big else 170, color=REC_MARK, edgecolor="black", linewidth=1.2, zorder=10)

    # Panel 1: whole hole.
    _draw_hole_art(ax1, rng)
    draw_points(ax1, big=False)
    ax1.add_patch(plt.Rectangle((zc[0] - half, zc[1] - half), 2 * half, 2 * half, fill=False,
                                edgecolor="white", linestyle="--", linewidth=2.2, zorder=11))
    ax1.text(zc[0] - half, zc[1] + half + 1.2, "zoom box (panel 2)", color="white", fontsize=8, zorder=11,
             bbox=dict(facecolor="#222222", alpha=0.7, pad=1.5, edgecolor="none"))
    ax1.set_xlim(-35, 35)
    ax1.set_ylim(130, 200)
    ax1.set_aspect("equal")
    ax1.set_title("Whole hole", color=TEXT, fontsize=11)

    # Panel 2: zoom.
    _draw_hole_art(ax2, np.random.default_rng(42))
    draw_points(ax2, big=True)
    ax2.set_xlim(zc[0] - half, zc[0] + half)
    ax2.set_ylim(zc[1] - half, zc[1] + half)
    ax2.set_aspect("equal")
    if abs(rec[0] - PIN[0]) + abs(rec[1] - PIN[1]) > 0.5:
        ax2.annotate("", xy=rec, xytext=PIN, zorder=9,
                     arrowprops=dict(arrowstyle="-|>", color="white", lw=2.5, shrinkA=14, shrinkB=12))
    ax2.text(0.03, 0.97,
             f"aim at pin  →  recommended aim\n{best_dx:+.0f} yd offline, {best_dy:+.0f} yd carry",
             transform=ax2.transAxes, va="top", ha="left", fontsize=9, color=TEXT, zorder=12,
             bbox=dict(facecolor="white", alpha=0.9, edgecolor="#999999", pad=4))
    ax2.set_title("Zoom: aim at pin vs recommended aim", color=TEXT, fontsize=11)

    for ax in (ax1, ax2):
        ax.set_xlabel("offline (yds, + = right)", color=TEXT)
        ax.set_ylabel("distance from tee (yds)", color=TEXT)
        ax.tick_params(colors=TEXT)
        for spine in ax.spines.values():
            spine.set_color("#999999")

    # Panel 3: the grid the search evaluated.
    grid = result["expected_cost_grid"]
    off, car = result["offline_offsets"], result["carry_offsets"]
    ax3.set_facecolor(AX_BG)
    im = ax3.imshow(grid, origin="lower", aspect="auto", cmap="YlOrRd",
                    extent=[off[0] - 2.5, off[-1] + 2.5, car[0] - 2.5, car[-1] + 2.5])
    vmid = (grid.min() + grid.max()) / 2
    for i, dc in enumerate(car):
        for j, do in enumerate(off):
            ax3.text(do, dc, f"{grid[i, j]:.2f}", ha="center", va="center", fontsize=6.5,
                     color="white" if grid[i, j] > vmid + 0.35 * (grid.max() - vmid) else "#222222")
    # Outline the two cells instead of covering their numbers; small markers in the corner.
    for (cx, cy), edge in (((0, 0), "black"), ((best_dx, best_dy), REC_MARK)):
        ax3.add_patch(plt.Rectangle((cx - 2.5, cy - 2.5), 5, 5, fill=False, edgecolor=edge, linewidth=3, zorder=4))
    ax3.scatter([-1.5], [1.4], marker="*", s=110, color="white", edgecolor="black", linewidth=0.8, zorder=5)
    ax3.scatter([best_dx - 1.5], [best_dy + 1.4], marker="X", s=80, color=REC_MARK, edgecolor="black", linewidth=0.8, zorder=5)
    cbar = fig.colorbar(im, ax=ax3, fraction=0.046, pad=0.03)
    cbar.set_label("expected strokes remaining after the shot", color=TEXT)
    cbar.ax.tick_params(colors=TEXT)
    ax3.set_xlabel("aim offset from pin, offline (yds, + = right)", color=TEXT)
    ax3.set_ylabel("aim offset from pin, carry (yds, + = long)", color=TEXT)
    ax3.tick_params(colors=TEXT)
    ax3.set_title("Grid search: 55 aim points × 3,000 shots each", color=TEXT, fontsize=11)
    for spine in ax3.spines.values():
        spine.set_color("#999999")

    # Headline numbers.
    pin_cost, best_cost = result["aim_at_pin_expected_cost"], result["best_expected_cost"]
    c = result["confirm"]
    if c is None:
        line2 = "The recommended aim point is the pin itself."
    else:
        verdict = "significant" if c["p"] < 0.05 else "not significant"
        line2 = (f"Fresh-sample paired test ({c['n']:,} shots): saves {c['mean_saving']:.3f} strokes/approach "
                 f"(95% CI {c['ci95'][0]:.3f} to {c['ci95'][1]:.3f}), {fmt_p(c['p'])} → {verdict}")
    fig.suptitle(f"{label} — {club} approach.  Expected strokes remaining: {pin_cost:.3f} aiming at pin vs "
                 f"{best_cost:.3f} at recommended aim\n{line2}", color=TEXT, fontsize=12, y=0.99)

    # Shared legend under the panels.
    from matplotlib.lines import Line2D
    handles = [
        Line2D([], [], marker="o", color="none", markerfacecolor=PIN_CLOUD, markeredgecolor="#333333", markersize=8, label="simulated shots aimed at pin"),
        Line2D([], [], marker="o", color="none", markerfacecolor=REC_CLOUD, markeredgecolor="#7a6a00", markersize=8, label="simulated shots aimed at recommended point"),
    ]
    if real_shots is not None:
        handles.append(Line2D([], [], marker="D", color="none", markerfacecolor="none", markeredgecolor=REAL_DOTS,
                              markeredgewidth=1.5, markersize=8, label=f"real shots (n={len(real_shots)}, re-centered on pin distance)"))
    handles += [
        Line2D([], [], marker="*", color="none", markerfacecolor="white", markeredgecolor="black", markersize=15, label="pin (aim at pin)"),
        Line2D([], [], marker="X", color="none", markerfacecolor=REC_MARK, markeredgecolor="black", markersize=11, label="recommended aim point"),
    ]
    fig.legend(handles=handles, loc="lower center", ncol=len(handles), fontsize=9, frameon=True,
               facecolor="white", edgecolor="#999999", bbox_to_anchor=(0.5, 0.0))
    fig.subplots_adjust(left=0.05, right=0.97, top=0.86, bottom=0.14)
    fig.savefig(out_path, dpi=130, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"Saved {out_path}")


def report(result: dict, label: str):
    savings = result["aim_at_pin_expected_cost"] - result["best_expected_cost"]
    print(f"\n--- {label} ---")
    print(f"Aiming straight at the pin: expected {result['aim_at_pin_expected_cost']:.3f} strokes remaining after the shot")
    print(
        f"Grid-search optimum: {result['best_offline_offset']:+.0f}yd offline, "
        f"{result['best_carry_offset']:+.0f}yd carry from pin "
        f"-> expected {result['best_expected_cost']:.3f} strokes"
    )
    print(
        f"Apparent savings in the search sample: {savings:.3f} strokes/approach "
        f"(SE {result['savings_se']:.3f}, t-test p={result['savings_t_pvalue']:.3f}) "
        "-- OPTIMISTIC, picked as best of 55 on the same shots"
    )
    c = result["confirm"]
    if c is None:
        print("The best cell is the pin itself; nothing to confirm.")
        return
    print(
        f"Fresh-sample paired confirmation ({c['n']:,} new shots): saving {c['mean_saving']:.4f} strokes/approach, "
        f"95% CI [{c['ci95'][0]:.4f}, {c['ci95'][1]:.4f}], p={c['p']:.4f}"
    )
    if c["p"] < 0.05:
        print("-> statistically significant on fresh data: aiming off the pin helps here (check the effect size below).")
        print(f"   Effect size: {c['mean_saving']:.3f} strokes per approach shot.")
    else:
        print("-> NOT significant on fresh data: can't claim aiming off the pin helps; aim-at-pin is fine for this hole.")


if __name__ == "__main__":
    club = "7-Iron"

    real = pd.read_csv("reference_data/synthetic_shots.csv")
    real = real[(~real.is_partial) & (real.club == club)]

    calibrated = SyntheticGolfer.from_profile_json("reference_data/synthetic_profile.json", seed=99)
    print(f"Grid-searching aim point for {club}, pin at {PIN}...")
    result_calibrated = grid_search(calibrated, club, n_shots_per_point=3000)
    report(result_calibrated, "Calibrated synthetic profile (tight dispersion)")
    plot_grid(result_calibrated, club, calibrated, "output/aim_point_grid_search_calibrated.png",
              "Synthetic (calibrated, 3 handicap)", real_shots=real)

    # A much wider-dispersion golfer should show a bigger, clearer benefit from
    # aiming away from trouble -- aim-point strategy matters more the less
    # consistent you are, so this is the instructive comparison case.
    wide = SyntheticGolfer.from_handicap(22, seed=99)
    result_wide = grid_search(wide, club, n_shots_per_point=3000)
    report(result_wide, "Synthetic 22-handicap golfer (wide dispersion)")
    plot_grid(result_wide, club, wide, "output/aim_point_grid_search_wide.png", "Synthetic 22 handicap")
