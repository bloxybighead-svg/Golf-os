"""CLI entry point: sample shots for one synthetic golfer, write a CSV,
and save a dispersion scatter plot.

Examples:
    # 08/25 milestone: 10,000 shots from a skill-level golfer
    python generate_shots.py --skill-level mid_handicap --n-shots 10000

    # continuous handicap instead of a bucket
    python generate_shots.py --handicap 7

    # handicap band label (see HANDICAP_BANDS)
    python generate_shots.py --band 2-4

    # personalized: handicap + carries for a few clubs
    python generate_shots.py --handicap 9 --carry 7-Iron=155 --carry Driver=265

    # a golfer fitted from real data by calibrate.py
    python generate_shots.py --profile-json output/dillon_profile.json

    # restrict to one club
    python generate_shots.py --handicap 7 --club 9-Iron
"""

from __future__ import annotations

import argparse
from pathlib import Path

from synthetic_golfer import DEFAULT_PROFILES, HANDICAP_BANDS, SyntheticGolfer


def build_golfer(args) -> SyntheticGolfer:
    weights = {}
    for spec in args.club_weight or []:
        club, _, value = spec.partition("=")
        weights[club] = float(value)
    opts = dict(
        seed=args.seed,
        two_way_miss=args.two_way_miss,
        improvement_per_session=args.improve_per_session,
        club_weights=weights,
    )

    if args.profile_json:
        return SyntheticGolfer.from_profile_json(args.profile_json, **opts)
    if args.carry:
        carries = {}
        for spec in args.carry:
            club, _, value = spec.partition("=")
            carries[club] = float(value)
        return SyntheticGolfer.from_handicap_and_carries(
            args.handicap if args.handicap is not None else 15, carries, **opts
        )
    if args.band:
        return SyntheticGolfer.from_band(args.band, **opts)
    if args.handicap is not None:
        return SyntheticGolfer.from_handicap(args.handicap, **opts)
    return SyntheticGolfer(skill_level=args.skill_level, **opts)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--skill-level", choices=list(DEFAULT_PROFILES), default="mid_handicap")
    parser.add_argument("--handicap", type=float, help="continuous handicap index, e.g. 1.9")
    parser.add_argument("--band", choices=list(HANDICAP_BANDS), help="handicap band label")
    parser.add_argument("--carry", action="append", metavar="CLUB=YDS",
                        help="known carry, repeatable, e.g. --carry 7-Iron=155")
    parser.add_argument("--profile-json", help="calibrate.py-fitted profile JSON")
    parser.add_argument("--club", action="append", help="restrict to club(s), repeatable")
    parser.add_argument("--n-shots", type=int, default=10_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out-dir", default="output")
    parser.add_argument("--no-ellipses", action="store_true",
                        help="do not draw the 90%% dispersion ellipse around each club")
    parser.add_argument("--show", action="store_true",
                        help="open the plot in an interactive window after saving")
    parser.add_argument("--two-way-miss", action="store_true",
                        help="golfer misses both directions equally instead of one repeatable shape")
    parser.add_argument("--improve-per-session", type=float, default=0.0, metavar="FRAC",
                        help="fractional tightening of dispersion per session, e.g. 0.02")
    parser.add_argument("--club-weight", action="append", metavar="CLUB=W",
                        help="per-club skill weight, repeatable; <1 better, >1 worse (e.g. SW=0.7)")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    golfer = build_golfer(args)
    df = golfer.sample_shots(args.n_shots, clubs=args.club)

    tag = golfer.skill_level.replace("/", "_")
    csv_path = out_dir / f"simulated_shots_{tag}.csv"
    df.to_csv(csv_path, index=False)

    plot_path = out_dir / f"shot_dispersion_{tag}.png"
    golfer.plot_dispersion(df, save_path=str(plot_path),
                           show_ellipses=(False if args.no_ellipses else None))

    print(f"Golfer: {golfer.skill_level} (personal direction bias {golfer.golfer_bias_deg:+.2f} deg)")
    print(f"Wrote {len(df):,} shots to {csv_path}")
    print(f"Wrote plot to {plot_path}")
    print()
    print(df.groupby("club")["carry_yds"].agg(["mean", "std", "count"]).round(1))

    if args.show:
        import matplotlib.pyplot as plt

        plt.show()


if __name__ == "__main__":
    main()
