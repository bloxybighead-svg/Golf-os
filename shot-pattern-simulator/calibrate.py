"""Fit SyntheticGolfer parameters from a real golfer's own shots, instead
of guessing them.

Expected input CSV, one row per real shot:
    club, carry_yds, offline_yds
or
    club, carry_yds, direction_deg

offline_yds sign convention: positive = right of target, negative = left
(for a right-handed golfer). If you only have offline_yds, direction_deg
is derived as degrees(atan2(offline_yds, carry_yds)).

If the file also has launch_dir_deg and curve_yds (a launch-monitor
export), the two direction components are fit DIRECTLY from measurement
rather than assumed:
  - start_line_bias_deg / start_line_sd_deg: where the ball starts.
  - curve_bias_pct / curve_sd_pct: how much it bends in flight, as a
    fraction of carry.
  - curve_carry_slope: yards of carry per yard of SIGNED curve, fit by
    linear regression. Negative means draws fly farther than fades,
    which is what gives the dispersion ellipse its diagonal tilt.
Without those columns it falls back to splitting total direction spread
by the club's typical curve share.

Partial/chip shots are excluded by default (they have the same club but
a totally different distribution, and mixing them inflates the fitted
distance spread enormously). Pass --include-partials to keep them.

Writes a JSON profile in the same shape as DEFAULT_PROFILES that can be
passed straight into SyntheticGolfer(club_profiles=...).

Usage:
    python calibrate.py real_shots.csv --out my_profile.json --min-shots 10
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from synthetic_golfer import _CLUB_CURVE_SHARE as _CURVE_SHARE
from synthetic_golfer import _DEFAULT_CURVE_CARRY_SLOPE


def _fit_side_penalty(direction_deg: np.ndarray, carry_yds: np.ndarray) -> float:
    """Slope (yards/degree) of carry vs. |direction_deg| for one side of
    misses. Returns 0.0 if there's not enough spread to fit anything
    meaningful. Positive slope = that side costs distance as the miss
    gets bigger; negative = that side gains distance."""
    x = np.abs(direction_deg)
    if len(x) < 5 or np.ptp(x) < 1e-6:
        return 0.0
    slope, _intercept = np.polyfit(x, carry_yds, 1)
    # polyfit gives d(carry)/d(|angle|); a "cost" is carry going DOWN as
    # the miss gets bigger, so the penalty (yards lost per degree) is the
    # negative of that slope.
    return float(-slope)


def calibrate(df: pd.DataFrame, min_shots: int = 10) -> dict[str, dict[str, float]]:
    if "direction_deg" not in df.columns:
        df = df.copy()
        df["direction_deg"] = np.degrees(np.arctan2(df["offline_yds"], df["carry_yds"]))

    profile: dict[str, dict[str, float]] = {}
    for club, group in df.groupby("club"):
        if len(group) < min_shots:
            print(f"skipping {club}: only {len(group)} shots (need >= {min_shots})")
            continue

        direction_bias_deg = float(group["direction_deg"].mean())
        direction_sd_deg = float(group["direction_deg"].std())
        mean_carry_raw = float(group["carry_yds"].mean())

        # Fit the two direction components the simulator actually uses.
        # If the source data has measured start line and curve (a launch
        # monitor export), fit them directly; otherwise fall back to
        # splitting total direction by the club's typical curve share.
        if {"launch_dir_deg", "curve_yds"} <= set(group.columns) and group["curve_yds"].notna().all():
            start_bias = float(group["launch_dir_deg"].mean())
            start_sd = float(group["launch_dir_deg"].std())
            curve_bias_pct = float((group["curve_yds"] / group["carry_yds"]).mean())
            curve_sd_pct = float((group["curve_yds"] / group["carry_yds"]).std())
            # Yards of carry per yard of SIGNED curve. Negative means
            # draws fly farther than fades, which is what tilts the
            # dispersion ellipse. Fitting on |curve| instead (as an
            # earlier version did) is symmetric and yields no tilt.
            cy = group["curve_yds"].to_numpy()
            if len(cy) >= 5 and np.ptp(cy) > 1e-6:
                curve_slope = float(np.polyfit(cy, group["carry_yds"].to_numpy(), 1)[0])
                curve_slope = float(np.clip(curve_slope, -1.5, 0.5))
            else:
                curve_slope = _DEFAULT_CURVE_CARRY_SLOPE
        else:
            share = _CURVE_SHARE.get(club, 0.5)
            total_rad = np.radians(direction_sd_deg)
            start_bias = direction_bias_deg
            start_sd = float(np.degrees(total_rad * np.sqrt(1 - share)))
            curve_bias_pct = 0.0
            curve_sd_pct = float(total_rad * np.sqrt(share))
            curve_slope = _DEFAULT_CURVE_CARRY_SLOPE

        # The simulator subtracts the curve cost on every shot and adds
        # back its expected value, so the stored mean/CV must describe
        # the carry BEFORE that effect -- otherwise it double-counts and
        # simulated means drift away from the data they were fit to.
        curve = group["curve_yds"].to_numpy() if "curve_yds" in group else np.zeros(len(group))
        base = group["carry_yds"].to_numpy() - curve_slope * (curve - curve.mean())
        mean_carry = float(base.mean())
        distance_cv = float(base.std() / mean_carry)

        profile[club] = {
            "mean_carry": round(mean_carry, 1),
            "distance_cv": round(distance_cv, 4),
            "direction_sd_deg": round(direction_sd_deg, 2),
            "start_line_bias_deg": round(start_bias, 2),
            "start_line_sd_deg": round(start_sd, 2),
            "curve_bias_pct": round(curve_bias_pct, 4),
            "curve_sd_pct": round(curve_sd_pct, 4),
            "curve_carry_slope": round(curve_slope, 3),
            "n_shots": len(group),
        }

        print(
            f"{club:8s}  n={len(group):4d}  carry={mean_carry_raw:6.1f} (cv={distance_cv:.3f})  "
            f"start={start_bias:+5.2f}+/-{start_sd:4.2f} deg  "
            f"curve={curve_bias_pct*mean_carry_raw:+6.1f}+/-{curve_sd_pct*mean_carry_raw:5.1f} yds  "
            f"curve_slope={curve_slope:+.2f} yd/yd"
        )

    return profile


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv_path")
    parser.add_argument("--out", default="my_profile.json")
    parser.add_argument("--min-shots", type=int, default=10)
    parser.add_argument("--include-partials", action="store_true",
                        help="keep partial/chip shots (excluded by default)")
    args = parser.parse_args()

    df = pd.read_csv(args.csv_path)
    if "is_partial" in df.columns and not args.include_partials:
        before = len(df)
        df = df[~df["is_partial"]]
        print(f"excluded {before - len(df)} partial shots ({len(df)} full swings remain)\n")
    profile = calibrate(df, min_shots=args.min_shots)

    out_path = Path(args.out)
    out_path.write_text(json.dumps(profile, indent=2))
    print(f"\nWrote fitted profile for {len(profile)} clubs to {out_path}")



if __name__ == "__main__":
    main()
