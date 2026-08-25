"""Parse launch-monitor session_summary CSVs into one tidy shots CSV.

The export format: blocks per club, each starting with a club label line
("Dr,", "7i,", "56,", ...), then a header row, shot rows, and an Average
row. Offline/Curve use "3.0 L" / "2.8 R" notation (L = left, R = right).

Sign convention out: offline_yds negative = left, positive = right.

Partial-swing filtering: some sessions contain deliberate knockdown /
partial-swing blocks (e.g. 7-irons carried ~90 yds vs a ~160 yd full
swing). A shot is flagged is_partial when its carry is below 75% of the
club's overall median carry across all sessions -- crude but effective
at separating half-swings from genuine full-swing mishits, which rarely
lose 25%+ of carry.

Usage:
    python parse_sessions.py "C:/Users/Jeff/Desktop/archive" --out output/real_shots.csv
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

import pandas as pd

CLUB_NAMES = {
    "dr": "Driver", "3w": "3-Wood", "5w": "5-Wood", "7w": "7-Wood",
    "4i": "4-Iron", "5i": "5-Iron", "6i": "6-Iron", "7i": "7-Iron",
    "8i": "8-Iron", "9i": "9-Iron", "pw": "PW", "gw": "GW",
    "56": "56 (SW)", "60": "60 (LW)",
}


def _parse_signed(value: str) -> float | None:
    """'3.0 L' -> -3.0, '2.8 R' -> +2.8, '0.0' -> 0.0."""
    value = value.strip()
    if not value:
        return None
    m = re.match(r"^(-?[\d.]+)\s*([LR])?$", value)
    if not m:
        return None
    num = float(m.group(1))
    if m.group(2) == "L":
        num = -num
    return num


def parse_file(path: Path) -> list[dict]:
    rows = []
    current_club = None
    session_id = path.stem

    with open(path, newline="") as f:
        for record in csv.reader(f):
            if not record or all(not c.strip() for c in record):
                continue
            first = record[0].strip()

            if first.lower() in CLUB_NAMES and (len(record) < 3 or not record[2].strip()):
                current_club = CLUB_NAMES[first.lower()]
                continue
            if first in ("", "Average") or first.startswith("Dillon"):
                continue
            if not first.isdigit() or current_club is None:
                continue

            try:
                carry = float(record[3])
                offline = _parse_signed(record[6])
                # Launch Direction (deg, col 12) is the START LINE; Curve
                # (yds, col 7) is how much the ball bends in flight. Their
                # sum reconstructs Offline, which is what lets us model
                # direction as two physical components instead of one blob.
                curve = _parse_signed(record[7])
                launch_dir = _parse_signed(record[12])
            except (ValueError, IndexError):
                continue
            if offline is None:
                continue

            rows.append(
                {
                    "session": session_id,
                    "date": record[1].strip(),
                    "club": current_club,
                    "carry_yds": carry,
                    "offline_yds": offline,
                    "curve_yds": curve,
                    "launch_dir_deg": launch_dir,
                }
            )
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive_dir")
    parser.add_argument("--out", default="output/real_shots.csv")
    parser.add_argument("--partial-threshold", type=float, default=0.75)
    args = parser.parse_args()

    all_rows = []
    for path in sorted(Path(args.archive_dir).glob("session_summary*.csv")):
        rows = parse_file(path)
        all_rows.extend(rows)
        print(f"{path.name}: {len(rows)} shots")

    df = pd.DataFrame(all_rows)
    club_median = df.groupby("club")["carry_yds"].transform("median")
    df["is_partial"] = df["carry_yds"] < args.partial_threshold * club_median

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)

    print(f"\nTotal: {len(df)} shots ({df['is_partial'].sum()} flagged partial-swing)")
    print(df[~df["is_partial"]].groupby("club")["carry_yds"].agg(["count", "median"]).round(1))
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
