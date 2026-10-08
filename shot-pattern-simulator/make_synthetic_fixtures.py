"""Regenerate the SYNTHETIC reference data and test fixtures from a fixed seed.

These replace the author's real launch-monitor shots, which must not live in a
public repo. The golfer is a generic 3-handicap built by synthetic_golfer.py
(no real data is read), the CSV has the same columns and per-club shot / partial
counts as a real export, and the fitted profile is calibrate.py's output on it.

    python make_synthetic_fixtures.py

Writes (all committed):
    reference_data/synthetic_shots.csv      reference_data/synthetic_profile.json
    ../lib/golfer/__fixtures__/synthetic_shots.csv
    ../lib/golfer/__fixtures__/synthetic_fit.json
    ../lib/golfer/__fixtures__/synthetic-fitted-profile.json

Tests with exact expected values (lib/golfer/shotProfile.test.ts and
lib/course/strategy.test.ts) depend on the output. Change SEED or the targets
below only together with those tests.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

from calibrate import calibrate
from synthetic_golfer import SyntheticGolfer, profiles_for_handicap, scale_profiles_to_carries

SEED = 20260101
HANDICAP = 3
N_SESSIONS = 23

# Target full-swing carries (yds) and the (shots, partial swings) per club in a
# typical launch-monitor export. Clubs under 10 full swings are dropped by the
# calibrator (--min-shots 10), as in a real export.
BAG = {
    "Driver": (265, 162, 3), "3-Wood": (240, 11, 0), "7-Wood": (210, 19, 0),
    "4-Iron": (195, 7, 0), "5-Iron": (180, 21, 0), "6-Iron": (170, 35, 1),
    "7-Iron": (160, 68, 6), "8-Iron": (150, 22, 5), "9-Iron": (140, 15, 10),
    "PW": (125, 22, 12), "GW": (110, 71, 38), "SW": (100, 64, 23), "LW": (90, 72, 40),
}
# A 3-handicap's driver is tighter than the golfer these fixtures stand in for (direction SD
# 4.4 vs 5.3 deg), and the Colts Neck regression tests are about driver risk. Widen it to match.
CLUB_WEIGHTS = {"Driver": 1.2}
# generator name -> name in a launch-monitor export / the fitted profile
EXPORT_NAME = {"SW": "56 (SW)", "LW": "60 (LW)"}

HERE = Path(__file__).resolve().parent
LIB_FIXTURES = HERE.parent / "lib" / "golfer" / "__fixtures__"


def build_profile() -> dict[str, dict[str, float]]:
    base = profiles_for_handicap(HANDICAP)
    # The generator has no 7-Wood or Lob Wedge: borrow the neighbouring club's shape.
    base["7-Wood"] = dict(base["5-Wood"])
    base["LW"] = dict(base["SW"])
    return scale_profiles_to_carries(base, {club: v[0] for club, v in BAG.items()})


def make_shots() -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    golfer = SyntheticGolfer.from_profile_dict(build_profile(), name="synthetic", seed=SEED, club_weights=CLUB_WEIGHTS)
    # Spread the shots over sessions the way a practice log looks: a few long ones, several short.
    session_weights = rng.dirichlet(np.full(N_SESSIONS, 1.2))
    dates = pd.Timestamp("2026-01-05") + pd.to_timedelta(np.sort(rng.integers(0, 120, N_SESSIONS)), unit="D")

    frames = []
    for club, (_, n, n_partial) in BAG.items():
        df = golfer.sample_shots(n, clubs=[club]).copy()
        partial = np.zeros(n, dtype=bool)
        partial[rng.choice(n, size=n_partial, replace=False)] = True
        # A partial swing is a shorter, softer shot: carry and offline both scale down.
        factor = np.where(partial, rng.uniform(0.55, 0.85, n), 1.0)
        carry = (df["carry_yds"] * factor).round(1)
        # Carry per mph of ball speed: about 1.7 yd on a driver, falling to about 1.0 on wedges.
        speed = (carry / (1.68 - 0.003 * (265 - df["carry_yds"])) + rng.normal(0, 1.2, n)).round(1)
        sess = rng.choice(N_SESSIONS, size=n, p=session_weights)
        frames.append(pd.DataFrame({
            "session": [f"synthetic_session_{s + 1:02d}" for s in sess],
            "date": [dates[s].strftime("%m/%d/%Y") for s in sess],
            "club": EXPORT_NAME.get(club, club),
            "carry_yds": carry,
            "offline_yds": (df["offline_yds"] * factor).round(1),
            "curve_yds": df["curve_yds"].round(1),
            "launch_dir_deg": df["start_line_deg"].round(1),
            "ball_speed": speed,
            "is_partial": partial,
        }))
    out = pd.concat(frames, ignore_index=True)
    # Same order a log has: by session, then by date.
    order = pd.to_datetime(out["date"], format="%m/%d/%Y")
    return out.iloc[np.lexsort((out["session"], order))].reset_index(drop=True)


def main():
    shots = make_shots()
    full = shots[~shots["is_partial"]]
    fit = calibrate(full, min_shots=10)

    for path in (HERE / "reference_data" / "synthetic_shots.csv", LIB_FIXTURES / "synthetic_shots.csv"):
        shots.to_csv(path, index=False, lineterminator="\n")
    (HERE / "reference_data" / "synthetic_profile.json").write_text(json.dumps(fit, indent=2) + "\n")
    (LIB_FIXTURES / "synthetic_fit.json").write_text(json.dumps(fit, indent=2) + "\n")
    note = ("Synthetic fitted profile: calibrate.py output on make_synthetic_fixtures.py's generated shots "
            "(a generic 3-handicap, fixed seed). Per-club fitted parameters only. calibrate.py fits no mishit "
            "rate; from_profile_json runs with mishit_rate 0.")
    (LIB_FIXTURES / "synthetic-fitted-profile.json").write_text(json.dumps({"_note": note, "profile": fit}, indent=1) + "\n")
    print(f"\n{len(shots)} shots ({int(shots['is_partial'].sum())} partial), {shots['session'].nunique()} sessions")


if __name__ == "__main__":
    main()
