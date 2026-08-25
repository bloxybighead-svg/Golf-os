"""Interactive selector menu for the shot simulator.

Walks through skill level, clubs, and shot count with numbered prompts
instead of remembering command-line flags. Run with no arguments:

    python menu.py

Every answer has a default in [brackets] -- press Enter to accept it.
Prints the equivalent CLI command at the end, so the menu doubles as a
way to learn the flags.
"""

from __future__ import annotations

from pathlib import Path

from synthetic_golfer import BAG_ORDER, HANDICAP_BANDS, SyntheticGolfer


def _ask(prompt: str, default: str) -> str:
    answer = input(f"{prompt} [{default}]: ").strip()
    return answer or default


def _pick_clubs() -> list[str] | None:
    print("\n  0) Whole bag")
    for i, club in enumerate(BAG_ORDER, start=1):
        print(f"  {i:2d}) {club}")
    raw = _ask("\nClub numbers (comma-separated, 0 = whole bag)", "0")
    if raw.strip() == "0":
        return None
    picked = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            idx = int(part)
        except ValueError:
            print(f"  ignoring {part!r} (not a number)")
            continue
        if 1 <= idx <= len(BAG_ORDER):
            picked.append(BAG_ORDER[idx - 1])
        else:
            print(f"  ignoring {idx} (out of range)")
    return picked or None


def _pick_carries() -> dict[str, float]:
    """Optional: let the golfer enter real carries for a few clubs."""
    if _ask("\nEnter your own carry distances for a few clubs? (y/n)", "n").lower() != "y":
        return {}
    carries = {}
    print("  Enter a club number and a carry in yards. Blank line when done.")
    for i, club in enumerate(BAG_ORDER, start=1):
        print(f"  {i:2d}) {club}", end="   " if i % 4 else "\n")
    print()
    while True:
        raw = input("  club# yards (blank to finish): ").strip()
        if not raw:
            break
        parts = raw.replace(",", " ").split()
        if len(parts) != 2:
            print("    need two values, e.g. '1 250'")
            continue
        try:
            idx, yards = int(parts[0]), float(parts[1])
        except ValueError:
            print("    both values must be numbers")
            continue
        if not 1 <= idx <= len(BAG_ORDER):
            print("    club number out of range")
            continue
        carries[BAG_ORDER[idx - 1]] = yards
        print(f"    {BAG_ORDER[idx - 1]} = {yards:g} yds")
    return carries


def main():
    print("=" * 58)
    print("  Golf OS - Shot Pattern Simulator")
    print("=" * 58)

    bands = list(HANDICAP_BANDS)
    print("\nSkill level:")
    print("   0) Enter an exact handicap index")
    for i, band in enumerate(bands, start=1):
        print(f"  {i:2d}) {band} handicap")
    choice = _ask("\nChoice", "0")

    if choice == "0":
        handicap = float(_ask("Handicap index", "10"))
        band = None
    else:
        band = bands[int(choice) - 1]
        handicap = HANDICAP_BANDS[band]

    carries = _pick_carries()
    clubs = _pick_clubs()
    n_shots = int(_ask("\nHow many shots? (100 = one session, 10000 = full pattern)", "1000"))
    two_way = _ask("Two-way miss (misses both directions equally)? (y/n)", "n").lower() == "y"

    if carries:
        golfer = SyntheticGolfer.from_handicap_and_carries(
            handicap, carries, two_way_miss=two_way
        )
    else:
        golfer = SyntheticGolfer.from_handicap(handicap, two_way_miss=two_way)

    df = golfer.sample_shots(n_shots, clubs=clubs)

    out_dir = Path("output")
    out_dir.mkdir(exist_ok=True)
    tag = golfer.skill_level.replace("/", "_")
    csv_path = out_dir / f"simulated_shots_{tag}.csv"
    plot_path = out_dir / f"shot_dispersion_{tag}.png"
    df.to_csv(csv_path, index=False)
    golfer.plot_dispersion(df, save_path=str(plot_path))

    print("\n" + "=" * 58)
    print(df.groupby("club").agg(
        carry=("carry_yds", "mean"),
        carry_sd=("carry_yds", "std"),
        offline_sd=("offline_yds", "std"),
    ).round(1).to_string())
    print(f"\nSaved {len(df):,} shots -> {csv_path}")
    print(f"Saved plot        -> {plot_path}")

    # Show the equivalent CLI command so the menu teaches the flags.
    cmd = ["python generate_shots.py", f"--handicap {handicap:g}"]
    cmd += [f"--carry {c}={v:g}" for c, v in carries.items()]
    cmd += [f"--club {c}" for c in (clubs or [])]
    cmd.append(f"--n-shots {n_shots}")
    if two_way:
        cmd.append("--two-way-miss")
    print(f"\nSame thing from the command line:\n  {' '.join(cmd)} --show")

    if _ask("\nOpen the plot now? (y/n)", "y").lower() == "y":
        import matplotlib.pyplot as plt

        plt.show()


if __name__ == "__main__":
    main()
