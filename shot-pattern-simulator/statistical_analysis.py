"""Statistical validation: does the simulator's output for the author's
calibrated profile actually match his real shots, and how much real data
does a golfer need to enter before that calibration is trustworthy?

Five independent questions, each with its own section below:
  1. Significance testing (in-sample): two-sample t-test + two-sample KS
     test, simulated vs real, per club, on carry and offline distance.
  2. Bootstrap confidence intervals for the real-shot mean/SD per club.
  3. Power analysis: how does the bootstrap CI half-width shrink as the
     number of real shots grows? (averaged over many random subsamples)
  4. Distribution-overlap figure (real vs simulated histograms).
  5. Held-out validation: fit the profile on some SESSIONS, test on
     sessions it never saw, and compare against an uncalibrated
     handicap-only model.

Run: python statistical_analysis.py
Writes plots to output/ and a text copy of the console output to
statistical_analysis_output.txt.
"""

from __future__ import annotations

import contextlib
import io
import sys

import numpy as np
import pandas as pd
from scipy import stats

from calibrate import calibrate
from synthetic_golfer import SyntheticGolfer

pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 20)

REAL_SHOTS_PATH = "reference_data/synthetic_shots.csv"
PROFILE_PATH = "reference_data/synthetic_profile.json"
BOOTSTRAP_ITERS = 5000
RNG = np.random.default_rng(0)

# Plot style: white figures, light-gray plot area, two clearly different
# data colors (real = orange, simulated = blue).
FIG_BG = "white"
AX_BG = "#e8e8e8"
TEXT = "#222222"
REAL_COLOR = "#d95f02"
SIM_COLOR = "#1b6ca8"
REF_COLOR = "#2e7d32"


def style_axes(ax):
    ax.set_facecolor(AX_BG)
    ax.grid(color="white", linewidth=1)
    ax.set_axisbelow(True)
    ax.tick_params(colors=TEXT)
    ax.xaxis.label.set_color(TEXT)
    ax.yaxis.label.set_color(TEXT)
    ax.title.set_color(TEXT)
    for spine in ax.spines.values():
        spine.set_color("#999999")


def load_real_shots() -> pd.DataFrame:
    df = pd.read_csv(REAL_SHOTS_PATH)
    df = df[~df["is_partial"]]  # full swings only, matching what the model represents
    return df


def bootstrap_ci(values: np.ndarray, statistic=np.mean, iters: int = BOOTSTRAP_ITERS, alpha: float = 0.05):
    """Percentile-method bootstrap CI: resample WITH replacement `iters`
    times, recompute the statistic each time, take the [alpha/2, 1-alpha/2]
    percentiles of that distribution as the CI."""
    n = len(values)
    boot_stats = np.empty(iters)
    for i in range(iters):
        sample = RNG.choice(values, size=n, replace=True)
        boot_stats[i] = statistic(sample)
    lo, hi = np.percentile(boot_stats, [100 * alpha / 2, 100 * (1 - alpha / 2)])
    return float(lo), float(hi), float(statistic(values))


def calibrated_sims(real: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Simulated shots from the calibrated profile, one frame per club with
    n_real >= 8, drawn in a fixed order from a seed-7 golfer. Sections 1 and
    4 both use this so the table and the figure show the SAME draws."""
    golfer = SyntheticGolfer.from_profile_json(PROFILE_PATH, seed=7)
    sims = {}
    for club, real_club in real.groupby("club"):
        if len(real_club) < 8:
            continue
        sims[club] = golfer.sample_shots(n_shots=max(2000, len(real_club) * 10), clubs=[club])
    return sims


def section_1_significance_tests(real: pd.DataFrame) -> pd.DataFrame:
    print("\n" + "=" * 78)
    print("1. SIGNIFICANCE TESTS: simulated (calibrated profile) vs real shots")
    print("=" * 78)
    print(
        "H0 for the t-test: the two samples have the same mean.\n"
        "H0 for the KS test: the two samples are drawn from the same distribution\n"
        "(KS is the stricter test -- it checks the whole shape, not just the mean).\n"
        "p < 0.05 => reject H0 => simulator's output measurably differs from real.\n"
        "NOTE: this section is IN-SAMPLE (profile fit on these same shots). See\n"
        "section 5 for the held-out version.\n"
    )

    sims = calibrated_sims(real)
    rows = []
    for club, real_club in real.groupby("club"):
        n_real = len(real_club)
        if n_real < 8:
            continue  # too few real shots for any test to mean anything -- see section 3
        sim = sims[club]

        t_carry = stats.ttest_ind(real_club.carry_yds, sim.carry_yds, equal_var=False)
        ks_carry = stats.ks_2samp(real_club.carry_yds, sim.carry_yds)
        t_off = stats.ttest_ind(real_club.offline_yds, sim.offline_yds, equal_var=False)
        ks_off = stats.ks_2samp(real_club.offline_yds, sim.offline_yds)

        rows.append(
            {
                "club": club,
                "n_real": n_real,
                "carry_t_p": t_carry.pvalue,
                "carry_ks_p": ks_carry.pvalue,
                "carry_ks_stat": ks_carry.statistic,
                "offline_t_p": t_off.pvalue,
                "offline_ks_p": ks_off.pvalue,
                "offline_ks_stat": ks_off.statistic,
            }
        )

    result = pd.DataFrame(rows).set_index("club").sort_values("n_real", ascending=False)
    print(result.round(4))

    n_pass_carry = (result["carry_ks_p"] > 0.05).sum()
    n_pass_offline = (result["offline_ks_p"] > 0.05).sum()
    print(
        f"\nKS test (distribution shape, the stricter check): "
        f"{n_pass_carry}/{len(result)} clubs indistinguishable on carry (p>0.05), "
        f"{n_pass_offline}/{len(result)} on offline."
    )
    return result


def section_2_bootstrap_ci(real: pd.DataFrame) -> pd.DataFrame:
    print("\n" + "=" * 78)
    print("2. BOOTSTRAP 95% CONFIDENCE INTERVALS (real shots only, 5000 resamples)")
    print("=" * 78)

    rows = []
    for club, real_club in real.groupby("club"):
        n_real = len(real_club)
        if n_real < 5:
            continue
        carries = real_club.carry_yds.to_numpy()
        mean_lo, mean_hi, mean_pt = bootstrap_ci(carries, np.mean)
        sd_lo, sd_hi, sd_pt = bootstrap_ci(carries, np.std)
        rows.append(
            {
                "club": club,
                "n_real": n_real,
                "mean_carry": round(mean_pt, 1),
                "mean_ci_lo": round(mean_lo, 1),
                "mean_ci_hi": round(mean_hi, 1),
                "mean_ci_halfwidth": round((mean_hi - mean_lo) / 2, 1),
                "sd_carry": round(sd_pt, 1),
                "sd_ci_lo": round(sd_lo, 1),
                "sd_ci_hi": round(sd_hi, 1),
            }
        )
    result = pd.DataFrame(rows).set_index("club").sort_values("n_real", ascending=False)
    print(result)
    return result


def _boot_halfwidth(values: np.ndarray, statistic: str, iters: int, rng: np.random.Generator) -> float:
    """Vectorized percentile-bootstrap CI half-width (fast enough to average
    over many subsamples)."""
    idx = rng.integers(0, len(values), size=(iters, len(values)))
    samples = values[idx]
    boot = samples.mean(axis=1) if statistic == "mean" else samples.std(axis=1)
    lo, hi = np.percentile(boot, [2.5, 97.5])
    return float((hi - lo) / 2)


def section_3_power_analysis(real: pd.DataFrame):
    print("\n" + "=" * 78)
    print("3. POWER ANALYSIS: how many real shots before the CI stabilizes?")
    print("=" * 78)
    print(
        "For Driver and 7-Iron: for each n, draw 200 random subsamples of n real\n"
        "shots (without replacement), bootstrap a 95% CI on each (1,000\n"
        "resamples), and average the CI half-width over the 200 subsamples.\n"
        "Averaging removes the noise a single random subsample would add. The\n"
        "dashed line is the textbook normal-theory half-width 1.96*s/sqrt(n),\n"
        "using the club's full-sample SD.\n"
    )

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    power_rng = np.random.default_rng(1)
    REPS = 200
    fig, axes = plt.subplots(1, 2, figsize=(12, 5), facecolor=FIG_BG)
    summary = {}
    for ax, club in zip(axes, ["Driver", "7-Iron"]):
        club_shots = real[real.club == club].carry_yds.to_numpy()
        n_max = len(club_shots)
        sample_sizes = [n for n in [5, 8, 12, 18, 25, 35, 50, 70, 100, 130, n_max] if n <= n_max]

        mean_hw, sd_hw = [], []
        for n in sample_sizes:
            m, s = [], []
            for _ in range(REPS):
                sub = power_rng.choice(club_shots, size=n, replace=False)
                m.append(_boot_halfwidth(sub, "mean", 1000, power_rng))
                s.append(_boot_halfwidth(sub, "sd", 1000, power_rng))
            mean_hw.append(float(np.mean(m)))
            sd_hw.append(float(np.mean(s)))

        sigma = club_shots.std(ddof=1)
        theory = [1.96 * sigma / np.sqrt(n) for n in sample_sizes]
        summary[club] = (sample_sizes, mean_hw, sd_hw)

        print(f"\n{club} (n_max={n_max}, full-sample SD={sigma:.2f} yds):")
        for n, mhw, shw, th in zip(sample_sizes, mean_hw, sd_hw, theory):
            print(f"  n={n:3d}  mean CI half-width={mhw:5.2f} yds (theory {th:5.2f})   SD CI half-width={shw:5.2f} yds")
        first_under_2 = next((n for n, h in zip(sample_sizes, mean_hw) if h < 2.0), None)
        print(f"  -> mean-carry half-width first drops under 2 yds at n={first_under_2}")

        style_axes(ax)
        ax.plot(sample_sizes, mean_hw, "o-", color=SIM_COLOR, label="mean carry CI half-width")
        ax.plot(sample_sizes, sd_hw, "s-", color=REAL_COLOR, label="SD CI half-width")
        ax.plot(sample_sizes, theory, "--", color="#555555", lw=1.2, label="theory 1.96·s/√n (mean)")
        ax.axhline(2.0, color=REF_COLOR, lw=1.2, ls=":", label="2 yd reference line")
        ax.set_title(f"{club} (n = {n_max} real shots available)")
        ax.set_xlabel("number of real shots")
        ax.set_ylabel("95% CI half-width (yds)")
        ax.legend(fontsize=8, facecolor="white")

    fig.suptitle("Bootstrap CI half-width vs. number of real shots entered", color=TEXT)
    fig.tight_layout()
    fig.savefig("output/power_analysis.png", dpi=130, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("\nSaved output/power_analysis.png")


def section_4_overlap_figure(real: pd.DataFrame):
    print("\n" + "=" * 78)
    print("4. DISTRIBUTION OVERLAP FIGURE (real vs simulated, Driver + 7-Iron)")
    print("=" * 78)

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    sims = calibrated_sims(real)
    fig, axes = plt.subplots(2, 2, figsize=(11, 8), facecolor=FIG_BG)
    for r, club in enumerate(["Driver", "7-Iron"]):
        real_club = real[real.club == club]
        sim = sims[club]
        for c, (col, label) in enumerate([("carry_yds", "carry (yds)"), ("offline_yds", "offline (yds, + = right)")]):
            ax = axes[r, c]
            style_axes(ax)
            lo = min(real_club[col].min(), sim[col].min())
            hi = max(real_club[col].max(), sim[col].max())
            bins = np.linspace(lo, hi, 28)
            ax.hist(sim[col], bins=bins, density=True, color=SIM_COLOR, alpha=0.45, label=f"simulated (n={len(sim)})")
            ax.hist(real_club[col], bins=bins, density=True, color=REAL_COLOR, alpha=0.65, label=f"real (n={len(real_club)})")
            ks = stats.ks_2samp(real_club[col], sim[col])
            ax.set_title(f"{club} — {label.split(' (')[0]}   (KS p = {ks.pvalue:.2f})")
            ax.set_xlabel(label)
            ax.set_ylabel("density")
            ax.legend(fontsize=8, facecolor="white")
    fig.suptitle("Simulated vs real shot distributions (calibrated profile, in-sample)", color=TEXT)
    fig.tight_layout()
    fig.savefig("output/distribution_overlap.png", dpi=130, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("Saved output/distribution_overlap.png")


def _ks_row(club, real_vals_carry, sim_carry, real_vals_off, sim_off, n_real):
    t_c = stats.ttest_ind(real_vals_carry, sim_carry, equal_var=False)
    k_c = stats.ks_2samp(real_vals_carry, sim_carry)
    t_o = stats.ttest_ind(real_vals_off, sim_off, equal_var=False)
    k_o = stats.ks_2samp(real_vals_off, sim_off)
    return {
        "club": club,
        "n_real": n_real,
        "carry_mean_diff": float(np.mean(sim_carry) - np.mean(real_vals_carry)),
        "carry_t_p": t_c.pvalue,
        "carry_ks_D": k_c.statistic,
        "carry_ks_p": k_c.pvalue,
        "offline_sd_ratio": float(np.std(sim_off, ddof=1) / np.std(real_vals_off, ddof=1)),
        "offline_t_p": t_o.pvalue,
        "offline_ks_D": k_o.statistic,
        "offline_ks_p": k_o.pvalue,
    }


def section_5_held_out(real: pd.DataFrame, n_folds: int = 5, oversample: int = 20):
    print("\n" + "=" * 78)
    print("5. HELD-OUT VALIDATION (fit on some sessions, test on unseen sessions)")
    print("=" * 78)
    print(
        f"Whole SESSIONS are held out ({n_folds}-fold, seeded shuffle of the\n"
        f"{real.session.nunique()} full-swing sessions), because shots within a session are correlated.\n"
        "For each fold: fit a profile on the training sessions only, simulate\n"
        f"{oversample}x as many shots as the held-out fold has per club, then pool across\n"
        "folds and run the same t / KS tests against the held-out real shots.\n"
        "Clubs with < 10 training shots in a fold get no profile there, so those\n"
        "held-out shots are skipped (counted below).\n"
    )

    sessions = np.array(sorted(real.session.unique()))
    fold_rng = np.random.default_rng(11)
    folds = np.array_split(fold_rng.permutation(sessions), n_folds)

    pooled = {}  # club -> dict(real_carry, real_off, sim_carry, sim_off)
    skipped = 0
    for f, test_sessions in enumerate(folds):
        test = real[real.session.isin(test_sessions)]
        train = real[~real.session.isin(test_sessions)]
        with contextlib.redirect_stdout(io.StringIO()):
            profile = calibrate(train, min_shots=10)
        golfer = SyntheticGolfer.from_profile_dict(profile, seed=100 + f)
        for club, test_club in test.groupby("club"):
            if club not in profile:
                skipped += len(test_club)
                continue
            sim = golfer.sample_shots(n_shots=oversample * len(test_club), clubs=[club])
            p = pooled.setdefault(club, {"rc": [], "ro": [], "sc": [], "so": []})
            p["rc"].extend(test_club.carry_yds); p["ro"].extend(test_club.offline_yds)
            p["sc"].extend(sim.carry_yds); p["so"].extend(sim.offline_yds)

    rows = []
    for club, p in pooled.items():
        if len(p["rc"]) < 8:
            continue
        rows.append(_ks_row(club, np.array(p["rc"]), np.array(p["sc"]), np.array(p["ro"]), np.array(p["so"]), len(p["rc"])))
    held = pd.DataFrame(rows).set_index("club").sort_values("n_real", ascending=False)
    print("HELD-OUT results (calibrated on other sessions):")
    print(held.round(4))
    print(f"\nHeld-out shots skipped (club had <10 training shots in that fold): {skipped}")
    print(
        f"KS on carry: {(held.carry_ks_p > 0.05).sum()}/{len(held)} clubs pass (p>0.05); "
        f"KS on offline: {(held.offline_ks_p > 0.05).sum()}/{len(held)}."
    )

    # Baseline: an UNCALIBRATED model that only knows a handicap, compared to
    # ALL of the author's full-swing shots (there is nothing to hold out here
    # because it never saw them). Handicap 3.0 = midpoint of his 1.9-4 range.
    print("\nBASELINE: uncalibrated handicap-only model (handicap 3.0) vs real shots")
    base_rows = []
    baselines = {
        "handicap only": SyntheticGolfer.from_handicap(3.0, seed=5),
        "handicap + Driver & 7-Iron carries": SyntheticGolfer.from_handicap_and_carries(
            3.0, {"Driver": 264.0, "7-Iron": 162.5}, seed=5
        ),
    }
    for label, g in baselines.items():
        for club, real_club in real.groupby("club"):
            if club not in g.club_profiles or len(real_club) < 8:
                continue
            sim = g.sample_shots(n_shots=max(2000, len(real_club) * 10), clubs=[club])
            row = _ks_row(club, real_club.carry_yds.to_numpy(), sim.carry_yds.to_numpy(),
                          real_club.offline_yds.to_numpy(), sim.offline_yds.to_numpy(), len(real_club))
            row["model"] = label
            base_rows.append(row)
    base = pd.DataFrame(base_rows).set_index(["model", "club"])
    print(base.round(4))
    for label in baselines:
        b = base.loc[label]
        print(f"  {label}: KS carry pass {(b.carry_ks_p > 0.05).sum()}/{len(b)}, KS offline pass {(b.offline_ks_p > 0.05).sum()}/{len(b)}")
    return held, base


class _Tee:
    def __init__(self, *streams):
        self.streams = streams

    def write(self, data):
        for s in self.streams:
            s.write(data)

    def flush(self):
        for s in self.streams:
            s.flush()


if __name__ == "__main__":
    with open("statistical_analysis_output.txt", "w", encoding="utf-8") as fh:
        original = sys.stdout
        sys.stdout = _Tee(original, fh)
        try:
            real = load_real_shots()
            section_1_significance_tests(real)
            section_2_bootstrap_ci(real)
            section_3_power_analysis(real)
            section_4_overlap_figure(real)
            section_5_held_out(real)
        finally:
            sys.stdout = original
