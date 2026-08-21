"""Fit SyntheticGolfer parameters from a real golfer's own shots, instead
of guessing them.

Expected input CSV, one row per real shot:
    club, carry_yds, offline_yds
or
    club, carry_yds, direction_deg

offline_yds sign convention: positive = right of target, negative = left
(for a right-handed golfer). If you only have offline_yds, direction_deg
is derived as degrees(atan2(offline_yds, carry_yds)).

For each club with enough shots, this prints:
  - mean_carry, distance_cv, direction_bias_deg, direction_sd_deg
  - right_penalty_per_deg / left_penalty_per_deg: yards of carry lost
    per degree of miss on each side, fit separately by simple linear
    regression of carry_yds on |direction_deg| within that side. This is
    where we actually check whether "left misses go farther than right
    misses" holds for THIS golfer, rather than assuming it.

and writes a JSON profile in the same shape as DEFAULT_PROFILES that can
be passed straight into SyntheticGolfer(club_profiles=...).

Usage:
    python calibrate.py real_shots.csv --out my_profile.json --min-shots 10
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


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

        right = group[group["direction_deg"] >= 0]
        left = group[group["direction_deg"] < 0]
        right_penalty = _fit_side_penalty(right["direction_deg"].to_numpy(), right["carry_yds"].to_numpy())
        left_penalty = _fit_side_penalty(left["direction_deg"].to_numpy(), left["carry_yds"].to_numpy())

        # The simulator re-applies the side penalties on every sampled
        # shot, so the stored mean/CV must describe the ZERO-DEGREE base
        # carry and the residual spread AFTER the direction effect is
        # removed -- otherwise the penalty gets double-counted and the
        # simulated means/SDs drift away from the real data they were
        # fit to.
        penalty = np.where(
            group["direction_deg"] >= 0,
            right_penalty * group["direction_deg"].abs(),
            left_penalty * group["direction_deg"].abs(),
        )
        base_carry_per_shot = group["carry_yds"].to_numpy() + penalty
        mean_carry = float(base_carry_per_shot.mean())
        distance_cv = float(base_carry_per_shot.std() / mean_carry)

        profile[club] = {
            "mean_carry": round(mean_carry, 1),
            "distance_cv": round(distance_cv, 4),
            "direction_bias_deg": round(direction_bias_deg, 2),
            "direction_sd_deg": round(direction_sd_deg, 2),
            "right_penalty_per_deg": round(right_penalty, 3),
            "left_penalty_per_deg": round(left_penalty, 3),
            "n_shots": len(group),
        }

        print(
            f"{club:8s}  n={len(group):4d}  carry={mean_carry:6.1f} (cv={distance_cv:.3f})  "
            f"dir_bias={direction_bias_deg:+5.2f} deg  dir_sd={direction_sd_deg:5.2f} deg  "
            f"right_penalty={right_penalty:+.2f} yd/deg (n={len(right)})  "
            f"left_penalty={left_penalty:+.2f} yd/deg (n={len(left)})"
        )

    return profile


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv_path")
    parser.add_argument("--out", default="my_profile.json")
    parser.add_argument("--min-shots", type=int, default=10)
    args = parser.parse_args()

    df = pd.read_csv(args.csv_path)
    profile = calibrate(df, min_shots=args.min_shots)

    out_path = Path(args.out)
    out_path.write_text(json.dumps(profile, indent=2))
    print(f"\nWrote fitted profile for {len(profile)} clubs to {out_path}")

    all_right = [p["right_penalty_per_deg"] for p in profile.values()]
    all_left = [p["left_penalty_per_deg"] for p in profile.values()]
    if all_right and all_left:
        print(f"\nAcross clubs: avg right-side penalty {np.mean(all_right):+.2f} yd/deg, "
              f"avg left-side penalty {np.mean(all_left):+.2f} yd/deg")
        print("(positive = that side costs carry distance as the miss gets bigger; "
              "negative = that side gains distance)")


if __name__ == "__main__":
    main()
