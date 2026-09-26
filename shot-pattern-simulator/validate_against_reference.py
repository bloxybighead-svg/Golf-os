"""Compare SyntheticGolfer output against the reference seed dataset.

reference_data/synthetic_shots_all_clubs_by_handicap.csv is itself
SYNTHETIC seed data (100 shots x 12 clubs x 4 handicap profiles at
0/4/8/12), generated independently from the same research family this
model is calibrated to: Broadie's angular dispersion model, Shot Scope /
Arccos / TrackMan carry composites, and Shot Scope miss-bias stats. It
is a cross-check between two independent implementations of the same
published parameters -- NOT ground truth. Where the two disagree, the
question is which choice traces to a published number, not which file
to copy.

Known intentional differences (why deltas below are expected):
  - Direction sigma: reference uses 5.0 deg (scratch) -> 6.6 (12 hcp),
    +0.5 for driver. We anchor to Broadie's published 4.5/5.4/6.4/8.1
    at hcp 0/6/15/24 with a per-club taper, so our wedges are tighter
    and our high-handicap tail is wider.
  - Short-miss bias: reference shifts iron/wedge carry means down a few
    yards ("80% of missed greens are short"). We model mean carry as the
    true average and treat short-missing as an AIMING error (golfers
    play their best-case number), which belongs in the aim-point layer,
    not the swing model. Their carry means therefore run slightly below
    ours on irons.
  - 100 shots/cell means the reference's own SDs carry ~10% sampling
    noise; deltas inside that band are indistinguishable from noise.

Usage:
    python validate_against_reference.py
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from synthetic_golfer import SyntheticGolfer

REFERENCE_CSV = "reference_data/synthetic_shots_all_clubs_by_handicap.csv"

# reference club labels -> our bag (their hybrid gaps like our 5-wood)
CLUB_MAP = {
    "driver": "Driver", "3w": "3-Wood", "hybrid": "5-Wood",
    "4i": "4-Iron", "5i": "5-Iron", "6i": "6-Iron", "7i": "7-Iron",
    "8i": "8-Iron", "9i": "9-Iron", "pw": "PW", "gw": "GW", "sw": "SW",
}

N_GOLFERS = 12       # average several synthetic golfers so one golfer's
N_SHOTS = 2000       # personal bias draw doesn't dominate the comparison


def our_stats(handicap: float) -> pd.DataFrame:
    frames = []
    for seed in range(N_GOLFERS):
        g = SyntheticGolfer.from_handicap(handicap, seed=seed)
        frames.append(g.sample_shots(N_SHOTS))
    df = pd.concat(frames)
    return df.groupby("club").agg(
        ours_carry=("carry_yds", "mean"),
        ours_carry_sd=("carry_yds", "std"),
        ours_off_sd=("offline_yds", "std"),
    )


def main():
    ref = pd.read_csv(REFERENCE_CSV)
    ref["club"] = ref["club"].map(CLUB_MAP)

    for hcp in sorted(ref["handicap"].unique()):
        r = ref[ref["handicap"] == hcp].groupby("club").agg(
            ref_carry=("carry_yards", "mean"),
            ref_carry_sd=("carry_yards", "std"),
            ref_off_sd=("offline_yards", "std"),
        )
        table = r.join(our_stats(hcp))
        table["d_carry"] = table["ours_carry"] - table["ref_carry"]
        table["d_carry_sd"] = table["ours_carry_sd"] - table["ref_carry_sd"]
        table["d_off_sd"] = table["ours_off_sd"] - table["ref_off_sd"]
        table = table.reindex(CLUB_MAP.values())

        print(f"\n=== handicap {hcp} (reference vs SyntheticGolfer.from_handicap({hcp})) ===")
        print(table.round(1).to_string())

        worst = table["d_carry"].abs().max()
        print(f"largest carry-mean gap: {worst:.1f} yds")


if __name__ == "__main__":
    main()
