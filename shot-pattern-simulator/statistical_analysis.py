"""Statistical validation: does the simulator's output for Dillon's
calibrated profile actually match his real shots, and how much real data
does a golfer need to enter before that calibration is trustworthy?

Three independent questions, each with its own section below:
  1. Significance testing: two-sample t-test + two-sample KS test,
     simulated vs real, per club, on both carry and offline distance.
  2. Bootstrap confidence intervals for the real-shot mean/SD per club.
  3. Power analysis: how does the bootstrap CI half-width shrink as the
     number of real shots grows? Where does it stop mattering?

Run: python statistical_analysis.py
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

from synthetic_golfer import SyntheticGolfer

REAL_SHOTS_PATH = "reference_data/real_shots.csv"
PROFILE_PATH = "reference_data/dillon_profile.json"
BOOTSTRAP_ITERS = 5000
RNG = np.random.default_rng(0)


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


def section_1_significance_tests(real: pd.DataFrame) -> pd.DataFrame:
    print("\n" + "=" * 78)
    print("1. SIGNIFICANCE TESTS: simulated (calibrated profile) vs real shots")
    print("=" * 78)
    print(
        "H0 for the t-test: the two samples have the same mean.\n"
        "H0 for the KS test: the two samples are drawn from the same distribution\n"
        "(KS is the stricter test -- it checks the whole shape, not just the mean).\n"
        "p < 0.05 => reject H0 => simulator's output measurably differs from real.\n"
    )

    golfer = SyntheticGolfer.from_profile_json(PROFILE_PATH, seed=7)
    rows = []
    for club, real_club in real.groupby("club"):
        n_real = len(real_club)
        if n_real < 8:
            continue  # too few real shots for any test to mean anything -- see section 3
        sim = golfer.sample_shots(n_shots=max(2000, n_real * 10), clubs=[club])

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
    pd.set_option("display.width", 120)
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


def section_3_power_analysis(real: pd.DataFrame):
    print("\n" + "=" * 78)
    print("3. POWER ANALYSIS: how many real shots before the CI stabilizes?")
    print("=" * 78)
    print(
        "For Driver (n=159, the most real data of any club) and 7-Iron (n=62):\n"
        "bootstrap-resample increasing subsample sizes FROM the real pool and\n"
        "watch the 95% CI half-width for mean carry and SD shrink.\n"
    )

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 2, figsize=(12, 5), facecolor="#0a0a0a")
    for ax, club in zip(axes, ["Driver", "7-Iron"]):
        club_shots = real[real.club == club].carry_yds.to_numpy()
        n_max = len(club_shots)
        sample_sizes = [n for n in [5, 8, 12, 18, 25, 35, 50, 70, 100, 130, n_max] if n <= n_max]

        mean_halfwidths, sd_halfwidths = [], []
        for n in sample_sizes:
            # subsample n real shots (without replacement from the real pool),
            # then bootstrap-resample THAT subsample to get its CI -- simulates
            # "what if this golfer had only hit n real shots"
            subsample = RNG.choice(club_shots, size=n, replace=False)
            mean_lo, mean_hi, _ = bootstrap_ci(subsample, np.mean, iters=2000)
            sd_lo, sd_hi, _ = bootstrap_ci(subsample, np.std, iters=2000)
            mean_halfwidths.append((mean_hi - mean_lo) / 2)
            sd_halfwidths.append((sd_hi - sd_lo) / 2)

        print(f"\n{club} (n_max={n_max}):")
        for n, mhw, shw in zip(sample_sizes, mean_halfwidths, sd_halfwidths):
            print(f"  n={n:3d}  mean CI half-width={mhw:5.2f} yds   SD CI half-width={shw:5.2f} yds")

        ax.set_facecolor("#0a0a0a")
        ax.plot(sample_sizes, mean_halfwidths, "o-", color="#38bdf8", label="mean carry CI half-width")
        ax.plot(sample_sizes, sd_halfwidths, "o-", color="#f97316", label="SD CI half-width")
        ax.axhline(2.0, color="#22c55e", lw=1, ls="--", label="2 yd reference line")
        ax.set_title(club, color="white")
        ax.set_xlabel("n real shots", color="#9ca3af")
        ax.set_ylabel("95% CI half-width (yds)", color="#9ca3af")
        ax.tick_params(colors="#9ca3af")
        ax.legend(fontsize=8)
        for spine in ax.spines.values():
            spine.set_color("#333333")

    fig.suptitle("Bootstrap CI half-width vs. number of real shots entered", color="white")
    fig.tight_layout()
    fig.savefig("output/power_analysis.png", dpi=130, facecolor=fig.get_facecolor())
    print("\nSaved output/power_analysis.png")


if __name__ == "__main__":
    real = load_real_shots()
    section_1_significance_tests(real)
    section_2_bootstrap_ci(real)
    section_3_power_analysis(real)
