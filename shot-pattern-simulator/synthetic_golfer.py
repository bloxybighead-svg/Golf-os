"""SyntheticGolfer: generates realistic mock golf shot data for testing
the Golf OS dispersion/T-box/aim-point pipeline without needing real
range data first.

Model summary
-------------
Each shot's direction is built from three layered random effects
(a small "mixed effects" model, the same idea used for repeated
measurements on the same subject):

    shot_direction = golfer_bias + session_drift + shot_noise

  - golfer_bias:   a personal tendency drawn ONCE per golfer (e.g. this
                    golfer push-slices about 1 degree on average, forever).
  - session_drift: a temporary tendency drawn once per practice session
                    (a "good day" / "bad day" wobble on top of the
                    golfer's baseline).
  - shot_noise:    normal per-shot randomness around whatever the golfer's
                    current bias is.

Carry distance uses the same idea, minus the personal bias term (there's
no evidence real golfers have a persistent "always short" quirk the way
they have a persistent curve direction) plus a session-level "hot/cold"
scale factor.

Direction is modeled as an ANGLE (degrees off the target line), not a
flat yards number. Converting angle -> lateral yards via carry * tan(angle)
naturally produces the cone-shaped dispersion pattern real shot data has
(a 2-degree miss is a couple yards offline on a wedge, but 10+ yards
offline on a driver) instead of an unrealistic constant-width band.

A small "mishit" mixture (a fraction of shots drawn from a wider
distribution) is layered on top so the pattern has the occasional bad
strike real range sessions show, instead of a perfectly clean ellipse.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


# Per-club dispersion calibrated SEPARATELY per skill tier -- each tier's
# numbers are independent, never a blend of neighboring tiers, so very
# consistent scratch golfers can't drag down the spread modeled for an
# average bag (and wild beginners can't inflate it). Sources:
#
#  - direction_sd_deg anchored to Broadie, "Assessing Golfer Performance
#    Using Golfmetrics" (Science and Golf V, 2008), the peer-reviewed
#    driver direction-error SDs: 4.0 deg (pro), 5.4 (low-hcp am),
#    6.4 (mid), 8.1 (high). Our hcp-0 anchor is a scratch amateur, set
#    between Broadie's pro and low-am at 4.5. Shorter clubs taper via
#    _CLUB_DIRECTION_RATIO; cross-check: 6.4 x 0.77 = 4.9 deg for a
#    mid-hcp 7-iron matches Stagner/Arccos's measured 12.5-yd offline
#    STDEV for a 10-index iron from ~150.
#  - mean_carry from the Shot Scope / Arccos / TrackMan composite
#    full-bag carry table. Absolute values matter less than gapping,
#    since users supply their own carries via from_handicap_and_carries.
#  - distance_cv anchored to GOLFTEC's 10k-swing 7-iron study (depth
#    dispersion grows much faster with handicap than width: 36 ft
#    scratch -> 56 ft 8-hcp -> 90 ft 13-hcp) and HackMotion's depth
#    charts: ~4.5% of carry at scratch rising to ~11% at high handicap.
#    Wedges get 1.3x -- Broadie found short-game distance errors run
#    ~3x direction errors, so wedge ellipses are depth-dominated.
_CLUB_DIRECTION_RATIO = {
    "Driver": 1.00, "3-Wood": 0.95, "5-Wood": 0.90,
    "4-Iron": 0.85, "5-Iron": 0.82, "6-Iron": 0.80, "7-Iron": 0.77,
    "8-Iron": 0.75, "9-Iron": 0.73, "PW": 0.70, "GW": 0.70, "SW": 0.70,
}

# tier -> (driver direction SD in degrees, base distance CV)
_TIER_CALIBRATION = {
    "pro":           (4.5, 0.045),   # hcp 0 (scratch amateur)
    "low_handicap":  (5.4, 0.055),   # hcp ~6
    "mid_handicap":  (6.4, 0.075),   # hcp ~15
    "high_handicap": (8.1, 0.110),   # hcp ~24
}

_TIER_CARRIES = {
    "pro":           {"Driver": 250, "3-Wood": 225, "5-Wood": 210, "4-Iron": 190,
                      "5-Iron": 180, "6-Iron": 172, "7-Iron": 165, "8-Iron": 155,
                      "9-Iron": 143, "PW": 130, "GW": 115, "SW": 95},
    "low_handicap":  {"Driver": 232, "3-Wood": 210, "5-Wood": 196, "4-Iron": 178,
                      "5-Iron": 168, "6-Iron": 160, "7-Iron": 153, "8-Iron": 143,
                      "9-Iron": 131, "PW": 121, "GW": 107, "SW": 89},
    "mid_handicap":  {"Driver": 205, "3-Wood": 188, "5-Wood": 175, "4-Iron": 160,
                      "5-Iron": 151, "6-Iron": 145, "7-Iron": 138, "8-Iron": 128,
                      "9-Iron": 118, "PW": 108, "GW": 96, "SW": 80},
    "high_handicap": {"Driver": 183, "3-Wood": 168, "5-Wood": 155, "4-Iron": 140,
                      "5-Iron": 132, "6-Iron": 127, "7-Iron": 122, "8-Iron": 112,
                      "9-Iron": 103, "PW": 94, "GW": 84, "SW": 69},
}

_WEDGE_CV_MULT = 1.3


def _build_default_profiles() -> dict[str, dict[str, dict[str, float]]]:
    profiles = {}
    for tier, (driver_sd, base_cv) in _TIER_CALIBRATION.items():
        profiles[tier] = {}
        for club, carry in _TIER_CARRIES[tier].items():
            cv = base_cv * (_WEDGE_CV_MULT if club in ("PW", "GW", "SW") else 1.0)
            profiles[tier][club] = {
                "mean_carry": float(carry),
                "distance_cv": round(cv, 4),
                "direction_sd_deg": round(driver_sd * _CLUB_DIRECTION_RATIO[club], 2),
            }
    return profiles


DEFAULT_PROFILES: dict[str, dict[str, dict[str, float]]] = _build_default_profiles()

# How spread out golfers' PERSONAL direction bias is, per tier (degrees).
# Better players aren't just tighter shot-to-shot -- they also tend to
# have a smaller and more repeatable personal tendency.
GOLFER_BIAS_SD_DEG = {
    "pro": 0.5,
    "low_handicap": 1.0,
    "mid_handicap": 2.0,
    "high_handicap": 3.5,
}

# Population-level rightward lean of that bias for right-handers, per
# tier (degrees; positive = right). Shot Scope driver miss splits:
# scratch 25% L / 25% R (symmetric), 15-hcp 23/26, 25-hcp 19/28 --
# higher handicaps skew right (the slice). Individual golfers still get
# their own draw around this mean, so a mid-hcp synthetic golfer can be
# a hooker; the POPULATION of them leans right.
GOLFER_BIAS_MEAN_DEG = {
    "pro": 0.0,
    "low_handicap": 0.0,
    "mid_handicap": 0.4,
    "high_handicap": 0.8,
}

# Mishit (two-sigma mixture) rate per anchor handicap. Kept deliberately
# small: Broadie's direction SDs were measured on ALL shots (mishits
# included), so this mixture only adds the heavy tails, not the bulk
# spread -- larger rates double-count variance and push simulated driver
# lateral SDs past Broadie's measured 21/23/27/31 yds. Directionally
# consistent with Arccos in-play rates (low-hcp ~12% wayward tee shots,
# 30+ hcp ~45% recovery/penalty), which include penalty outcomes this
# flat mixture doesn't model.
MISHIT_RATE_ANCHORS = ([0, 6, 15, 24], [0.03, 0.04, 0.06, 0.08])

# Handicap index each tier is anchored at, used to interpolate a
# continuous handicap into per-club parameters instead of forcing a
# submitted handicap into one of four buckets. These anchor values are
# themselves a rough guess, same caveat as everything else in this file
# until it's checked against real data.
ANCHOR_HANDICAPS = {
    "pro": 0,
    "low_handicap": 6,
    "mid_handicap": 15,
    "high_handicap": 24,
}

_INTERP_PARAMS = ("mean_carry", "distance_cv", "direction_sd_deg")


def profiles_for_handicap(handicap_index: float) -> dict[str, dict[str, float]]:
    """Interpolate DEFAULT_PROFILES to a continuous handicap index.

    Linear interpolation between the tier anchors above; a handicap
    outside [0, 24] clamps to the nearest anchor's values rather than
    extrapolating, since we have no basis for the shape of the curve
    past the ends.
    """
    tiers = sorted(ANCHOR_HANDICAPS, key=ANCHOR_HANDICAPS.get)
    xp = [ANCHOR_HANDICAPS[t] for t in tiers]
    clubs = DEFAULT_PROFILES[tiers[0]]
    result = {}
    for club in clubs:
        result[club] = {}
        for param in _INTERP_PARAMS:
            fp = [DEFAULT_PROFILES[t][club][param] for t in tiers]
            result[club][param] = float(np.interp(handicap_index, xp, fp))
    return result


def _interp_tier_scalar(handicap_index: float, per_tier: dict[str, float]) -> float:
    tiers = sorted(ANCHOR_HANDICAPS, key=ANCHOR_HANDICAPS.get)
    xp = [ANCHOR_HANDICAPS[t] for t in tiers]
    fp = [per_tier[t] for t in tiers]
    return float(np.interp(handicap_index, xp, fp))


def _bias_sd_for_handicap(handicap_index: float) -> float:
    return _interp_tier_scalar(handicap_index, GOLFER_BIAS_SD_DEG)


def _bias_mean_for_handicap(handicap_index: float) -> float:
    return _interp_tier_scalar(handicap_index, GOLFER_BIAS_MEAN_DEG)


def _mishit_rate_for_handicap(handicap_index: float) -> float:
    xp, fp = MISHIT_RATE_ANCHORS
    return round(float(np.interp(handicap_index, xp, fp)), 3)


def scale_profiles_to_carries(
    profiles: dict[str, dict[str, float]],
    known_carries: dict[str, float],
) -> dict[str, dict[str, float]]:
    """Rescale a tier's mean carries to fit a specific player's numbers.

    The separation this relies on: handicap controls dispersion SHAPE
    (direction SD in degrees, distance spread as a % of carry), while
    the player's speed controls SCALE (raw carries). A short-hitting and
    a long-hitting 9-handicap share roughly the same angular spread and
    percentage consistency -- they differ mainly in yardage. So the user
    supplies real carries for a few clubs, and every other club's mean
    carry is rescaled while dispersion parameters are left at tier level.

    The scale ratio is computed per provided club, then interpolated
    across the bag ordered by anchor carry (and held flat past the ends).
    Interpolating -- rather than one global ratio -- matters because a
    player can be e.g. long with driver but tier-average with wedges;
    with a single known club it degrades gracefully to one flat ratio.

    Clubs named in known_carries get their exact value.
    """
    unknown = [c for c in known_carries if c not in profiles]
    if unknown:
        raise ValueError(f"Unknown clubs {unknown}; profile has {list(profiles)}")

    ratios = sorted(
        (profiles[c]["mean_carry"], known_carries[c] / profiles[c]["mean_carry"])
        for c in known_carries
    )
    xp = [r[0] for r in ratios]
    fp = [r[1] for r in ratios]

    result = {}
    for club, params in profiles.items():
        scaled = dict(params)
        if club in known_carries:
            scaled["mean_carry"] = float(known_carries[club])
        else:
            ratio = float(np.interp(params["mean_carry"], xp, fp))
            scaled["mean_carry"] = round(params["mean_carry"] * ratio, 1)
        result[club] = scaled
    return result


# UI-friendly handicap bands. Each maps to a representative handicap
# index that from_handicap() interpolates from -- the bands are labels
# for user submission, not separate parameter tables, so adding or
# splitting a band never requires re-tuning anything.
HANDICAP_BANDS = {
    "plus": -2.0,
    "0-2": 1.0,
    "2-4": 3.0,
    "4-6": 5.0,
    "6-8": 7.0,
    "8-12": 10.0,
    "12-18": 15.0,
    "18+": 22.0,
}


class SyntheticGolfer:
    """Samples realistic golf shots for one synthetic golfer."""

    def __init__(
        self,
        skill_level: str,
        club_profiles: dict[str, dict[str, float]] | None = None,
        session_size: int = 60,
        drift_direction_sd_deg: float = 0.8,
        drift_distance_sd_pct: float = 0.015,
        mishit_rate: float = 0.05,
        mishit_multiplier: float = 2.5,
        seed: int | None = None,
        _bias_sd_override: float | None = None,
        _bias_mean_override: float | None = None,
    ):
        if club_profiles is None and skill_level not in DEFAULT_PROFILES:
            raise ValueError(
                f"Unknown skill_level {skill_level!r}; pass club_profiles "
                f"explicitly or use one of {list(DEFAULT_PROFILES)}"
            )

        self.skill_level = skill_level
        self.club_profiles = club_profiles or DEFAULT_PROFILES[skill_level]
        self.session_size = session_size
        self.drift_direction_sd_deg = drift_direction_sd_deg
        self.drift_distance_sd_pct = drift_distance_sd_pct
        self.mishit_rate = mishit_rate
        self.mishit_multiplier = mishit_multiplier

        # np.random.default_rng (PCG64) is the modern, statistically
        # cleaner replacement for the legacy np.random.seed()/np.random.X
        # global-state API -- better randomness quality and each
        # SyntheticGolfer gets its own independent, reproducible stream.
        self.rng = np.random.default_rng(seed)

        bias_sd = _bias_sd_override if _bias_sd_override is not None else GOLFER_BIAS_SD_DEG.get(skill_level, 2.0)
        bias_mean = _bias_mean_override if _bias_mean_override is not None else GOLFER_BIAS_MEAN_DEG.get(skill_level, 0.0)
        self.golfer_bias_deg = float(self.rng.normal(bias_mean, bias_sd))

    @classmethod
    def from_handicap(cls, handicap_index: float, seed: int | None = None, **kwargs) -> "SyntheticGolfer":
        """Build a golfer whose parameters are interpolated to a continuous
        handicap index (e.g. 1.9) instead of snapped to one of the four
        discrete skill_level buckets. See profiles_for_handicap()."""
        kwargs.setdefault("mishit_rate", _mishit_rate_for_handicap(handicap_index))
        return cls(
            skill_level=f"handicap_{handicap_index:g}",
            club_profiles=profiles_for_handicap(handicap_index),
            seed=seed,
            _bias_sd_override=_bias_sd_for_handicap(handicap_index),
            _bias_mean_override=_bias_mean_for_handicap(handicap_index),
            **kwargs,
        )

    @classmethod
    def from_handicap_and_carries(
        cls,
        handicap_index: float,
        known_carries: dict[str, float],
        seed: int | None = None,
        **kwargs,
    ) -> "SyntheticGolfer":
        """Build a golfer from a handicap plus real carries for a few
        clubs (e.g. {'7-Iron': 150, 'Driver': 240}). Handicap sets the
        dispersion shape; the supplied carries rescale the whole bag's
        distances to this player, taken at face value. See
        scale_profiles_to_carries()."""
        profiles = scale_profiles_to_carries(
            profiles_for_handicap(handicap_index), known_carries
        )
        kwargs.setdefault("mishit_rate", _mishit_rate_for_handicap(handicap_index))
        return cls(
            skill_level=f"handicap_{handicap_index:g}_personalized",
            club_profiles=profiles,
            seed=seed,
            _bias_sd_override=_bias_sd_for_handicap(handicap_index),
            _bias_mean_override=_bias_mean_for_handicap(handicap_index),
            **kwargs,
        )

    @classmethod
    def from_band(cls, band: str, seed: int | None = None, **kwargs) -> "SyntheticGolfer":
        """Build a golfer from a handicap band label (see HANDICAP_BANDS)."""
        if band not in HANDICAP_BANDS:
            raise ValueError(f"Unknown band {band!r}; use one of {list(HANDICAP_BANDS)}")
        golfer = cls.from_handicap(HANDICAP_BANDS[band], seed=seed, **kwargs)
        golfer.skill_level = f"band_{band}"
        return golfer

    @classmethod
    def from_profile_json(cls, json_path: str, name: str = "calibrated", seed: int | None = None, **kwargs) -> "SyntheticGolfer":
        """Build a golfer from a calibrate.py-fitted JSON profile. The
        fitted per-club direction_bias_deg values carry the golfer's real
        tendencies, so the random golfer-level bias is disabled. Mishit
        mixture and session drift default OFF too: the fitted SDs were
        measured on real shots that already contain both, so adding them
        again would double-count variance."""
        import json

        profiles = json.loads(Path(json_path).read_text())
        kwargs.setdefault("mishit_rate", 0.0)
        kwargs.setdefault("drift_direction_sd_deg", 0.0)
        kwargs.setdefault("drift_distance_sd_pct", 0.0)
        return cls(
            skill_level=name,
            club_profiles=profiles,
            seed=seed,
            _bias_sd_override=0.0,
            **kwargs,
        )

    def sample_shots(self, n_shots: int, clubs: list[str] | None = None) -> pd.DataFrame:
        """Sample n_shots and return a tidy DataFrame, one row per shot."""
        clubs = clubs or list(self.club_profiles.keys())
        club_choices = self.rng.choice(clubs, size=n_shots)

        session_direction_drift = 0.0
        session_distance_scale = 0.0
        rows = []

        for i in range(n_shots):
            if i % self.session_size == 0:
                session_direction_drift = self.rng.normal(0.0, self.drift_direction_sd_deg)
                session_distance_scale = self.rng.normal(0.0, self.drift_distance_sd_pct)

            club = club_choices[i]
            profile = self.club_profiles[club]

            is_mishit = self.rng.random() < self.mishit_rate
            spread_mult = self.mishit_multiplier if is_mishit else 1.0

            mean_carry = profile["mean_carry"] * (1 + session_distance_scale)
            distance_sd = profile["mean_carry"] * profile["distance_cv"] * spread_mult
            carry_yds = max(0.0, self.rng.normal(mean_carry, distance_sd))

            # Per-club bias (from calibration) layers on top of the
            # golfer-level bias: real golfers can sit left with wedges
            # but right with mid-irons, so one global number isn't enough.
            direction_mean = (
                self.golfer_bias_deg
                + profile.get("direction_bias_deg", 0.0)
                + session_direction_drift
            )
            direction_sd = profile["direction_sd_deg"] * spread_mult
            direction_deg = self.rng.normal(direction_mean, direction_sd)

            # Direction/distance are NOT independent for real golfers:
            # right-side misses (fade/slice for a righty) bleed carry from
            # added spin, left-side misses (draw/hook) fly hot. This is
            # what tilts the dispersion oval "long-left / short-right"
            # instead of an axis-aligned blob. Calibrated profiles carry
            # their own fitted per-club values; default/interpolated
            # profiles fall back to slopes proportional to club carry,
            # scaled to match what a real 2-4 handicap's 565-shot fit
            # measured (driver: +1.29 yd/deg right, -0.50 yd/deg left,
            # i.e. ~+0.005/-0.002 per yard of carry).
            if direction_deg >= 0:
                penalty = profile.get("right_penalty_per_deg", 0.005 * profile["mean_carry"])
            else:
                penalty = profile.get("left_penalty_per_deg", -0.002 * profile["mean_carry"])
            carry_yds = max(0.0, carry_yds - penalty * abs(direction_deg))

            offline_yds = carry_yds * np.tan(np.radians(direction_deg))

            rows.append(
                {
                    "shot_id": i,
                    "session_id": i // self.session_size,
                    "skill_level": self.skill_level,
                    "club": club,
                    "carry_yds": round(carry_yds, 1),
                    "offline_yds": round(offline_yds, 2),
                    "direction_deg": round(direction_deg, 2),
                    "is_mishit": is_mishit,
                }
            )

        return pd.DataFrame(rows)

    def plot_dispersion(self, df: pd.DataFrame, save_path: str | None = None):
        """Scatter plot of offline vs. carry, drawn over a simple range/course visual."""
        import matplotlib.pyplot as plt

        max_dist = float(df["carry_yds"].max()) * 1.15
        max_offline = float(df["offline_yds"].abs().max()) * 1.15
        half_width = max(max_offline, max_dist * 0.18)

        fig, ax = plt.subplots(figsize=(9, 11))
        ax.set_facecolor("#3f7d3f")
        ax.set_xlim(-half_width, half_width)
        ax.set_ylim(-10, max_dist)

        for d in range(50, int(max_dist) + 50, 50):
            ax.axhline(d, color="white", alpha=0.15, linewidth=0.8, zorder=1)
            ax.text(-half_width * 0.98, d, f"{d}y", color="white", alpha=0.5, fontsize=7, va="bottom")

        ax.axvline(0, color="white", linestyle="--", alpha=0.6, linewidth=1, zorder=1)
        ax.scatter(0, 0, color="white", marker="s", s=40, zorder=3, label="Tee")

        # Marker size/opacity scale with shot count: 10k shots need small
        # faint dots to show density, but a 100-shot session needs big
        # bright ones or the pattern is barely visible.
        n = len(df)
        size = float(np.clip(6000 / n, 10, 70))
        alpha = float(np.clip(120 / n, 0.5, 0.95))

        clubs = df["club"].unique()
        cmap = plt.get_cmap("tab20")
        for idx, club in enumerate(clubs):
            group = df[df["club"] == club]
            ax.scatter(
                group["offline_yds"],
                group["carry_yds"],
                s=size,
                alpha=alpha,
                color=cmap(idx % 20),
                label=club,
                zorder=2,
                edgecolors="white" if n <= 500 else "none",
                linewidths=0.4,
            )

        ax.set_xlabel("Offline (yds) — left (–) / right (+)")
        ax.set_ylabel("Carry distance (yds)")
        ax.set_title(f"{len(df):,} synthetic shots — {self.skill_level}")
        ax.legend(markerscale=2.5, loc="upper left", bbox_to_anchor=(1.02, 1), fontsize=8)
        fig.tight_layout()

        if save_path:
            fig.savefig(save_path, dpi=150)
        return fig
