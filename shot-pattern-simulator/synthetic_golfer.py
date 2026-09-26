"""SyntheticGolfer: generates realistic mock golf shot data for testing
the Golf OS dispersion/T-box/aim-point pipeline without needing real
range data first.

Model summary
-------------
Each shot's START LINE is built from layered random effects (a small
"mixed effects" model, the same idea used for repeated measurements on
the same subject):

    start_line = golfer_bias + club_bias + session_drift + shot_noise

  - golfer_bias:   a personal tendency drawn ONCE per golfer (e.g. this
                    golfer starts it about 1 degree right, forever).
  - club_bias:     a per-club offset, because real golfers are not
                    uniform across the bag.
  - session_drift: a temporary tendency drawn once per practice session
                    (a "good day" / "bad day" wobble on top of the
                    golfer's baseline).
  - shot_noise:    normal per-shot randomness around the current bias.

Carry distance uses the same session "hot/cold" scale factor, minus the
personal bias term (there's no evidence golfers have a persistent
"always short" quirk the way they have a persistent shot shape).

Direction has TWO physical components, not one (a golfer can start the
ball right and curve it back left -- a push-draw -- and a single
"direction" number averages those into a meaningless ~0 and hides the
actual shot shape):

    offline_yds = carry * tan(start_line_deg) + curve_yds

  - start_line_deg: where the ball STARTS relative to target (face angle).
  - curve_yds:      how far it bends in flight (spin axis), in yards.

This identity was verified against 565 real launch-monitor shots:
predicted offline correlates 0.9998 with measured offline (mean error
0.02 yds). Start line is modeled as an angle so it scales with club
distance; curve is modeled as a percentage of carry, because faster
swings impart more sidespin and curve more.

Carry distance is ASYMMETRIC (negatively skewed): mishits come up short
far more often than they fly long. Real data confirms this -- carry skew
measured -1.46 (6-iron), -0.64 (7-iron), -0.57 (SW) across the bag. A
symmetric normal would model an equal chance of a 20-yard flier and a
20-yard chunk, which is not how golf works.

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
#  - distance_cv is the DRIVER coefficient of variation; every other
#    club scales off it via _CLUB_DISTANCE_RATIO. Anchored to GOLFTEC's
#    10k-swing study (depth dispersion grows much faster with handicap
#    than width: 36 ft scratch -> 56 ft 8-hcp -> 90 ft 13-hcp) and
#    HackMotion's depth charts, then cross-checked against 565 measured
#    shots: 0.045 x 0.65 gives a scratch 7-iron CV of 0.029 against a
#    measured 0.0295. An earlier version applied the base CV flat across
#    the bag, which made irons about 60% too loose in distance.
_CLUB_DIRECTION_RATIO = {
    "Driver": 1.00, "3-Wood": 0.95, "5-Wood": 0.90,
    "4-Iron": 0.85, "5-Iron": 0.82, "6-Iron": 0.80, "7-Iron": 0.77,
    "8-Iron": 0.75, "9-Iron": 0.73, "PW": 0.70, "GW": 0.70, "SW": 0.70,
}

# What FRACTION OF DIRECTIONAL VARIANCE comes from curve rather than
# start line, per club. Measured from 565 real launch-monitor shots:
# driver 0.70, 7-iron 0.53, sand wedge 0.26 -- i.e. a driver's miss is
# mostly curve (high speed -> more sidespin), a wedge's miss is mostly
# where it started. Everything between is interpolated along that trend.
# The two components are combined so total dispersion still matches the
# Broadie-calibrated direction_sd_deg above; this only splits it into
# the two physical parts.
_CLUB_CURVE_SHARE = {
    "Driver": 0.70, "3-Wood": 0.68, "5-Wood": 0.64,
    "4-Iron": 0.60, "5-Iron": 0.57, "6-Iron": 0.55, "7-Iron": 0.53,
    "8-Iron": 0.47, "9-Iron": 0.42, "PW": 0.36, "GW": 0.31, "SW": 0.26,
}

# tier -> (driver direction SD in degrees, base distance CV)
_TIER_CALIBRATION = {
    # TrackMan 2024 PGA Tour carries + Broadie's measured Tour direction
    # SD of 4.0 deg. This is the "professional data" tier: every number
    # in it is published measurement, not interpolation.
    "tour":          (4.0, 0.035),   # PGA Tour
    "pro":           (4.5, 0.045),   # hcp 0 (scratch amateur)
    "low_handicap":  (5.4, 0.055),   # hcp ~6
    "mid_handicap":  (6.4, 0.075),   # hcp ~15
    "high_handicap": (8.1, 0.110),   # hcp ~24
}

# Iron/wedge carries are DERIVED from each tier's 7-iron anchor using
# fixed gapping ratios rather than listed independently, because the
# ProYardages composite table we started from had implausibly tight
# mid-iron gaps (8 yds 5i->6i, 7 yds 6i->7i) that no measured source
# supports. Two independent measured sources agree on the real shape:
#
#   ratio to 7-iron    TrackMan Tour 2024    Dillon's 565 real shots
#   4-Iron                   1.180                   1.202
#   5-Iron                   1.128                   1.127
#   6-Iron                   1.064                   1.068
#   8-Iron                   0.930                   0.915
#   9-Iron                   0.860                   0.868
#
# TrackMan gaps run 9-12 yds through the irons; so do Dillon's. Wedge
# ratios come from his measured data since TrackMan does not publish
# GW/SW/LW carries.
_IRON_RATIOS = {
    "4-Iron": 1.180, "5-Iron": 1.128, "6-Iron": 1.064, "7-Iron": 1.000,
    "8-Iron": 0.930, "9-Iron": 0.860, "PW": 0.780, "GW": 0.724, "SW": 0.607,
}

# Slower swingers have compressed gapping -- less speed differential
# between clubs means less distance differential. Shrinks the spread of
# the ratios above (toward 1.0) as handicap rises.
_TIER_GAP_SCALE = {"tour": 1.0, "pro": 1.0, "low_handicap": 0.96,
                   "mid_handicap": 0.92, "high_handicap": 0.87}

# 7-iron anchor + the long clubs, which are listed directly (driver and
# fairway-wood distance varies far more between players than iron
# gapping does, and comes from handicap-specific Arccos/Shot Scope data
# rather than from the Tour table).
_TIER_LONG_CLUBS = {
    "tour":          {"Driver": 275, "3-Wood": 243, "5-Wood": 230, "7-Iron": 172},
    "pro":           {"Driver": 250, "3-Wood": 225, "5-Wood": 210, "7-Iron": 165},
    "low_handicap":  {"Driver": 232, "3-Wood": 210, "5-Wood": 196, "7-Iron": 153},
    "mid_handicap":  {"Driver": 205, "3-Wood": 188, "5-Wood": 175, "7-Iron": 138},
    "high_handicap": {"Driver": 183, "3-Wood": 168, "5-Wood": 155, "7-Iron": 122},
}


def _build_tier_carries() -> dict[str, dict[str, float]]:
    carries = {}
    for tier, longs in _TIER_LONG_CLUBS.items():
        anchor = longs["7-Iron"]
        scale = _TIER_GAP_SCALE[tier]
        row = {k: float(v) for k, v in longs.items() if k != "7-Iron"}
        for club, ratio in _IRON_RATIOS.items():
            row[club] = round(anchor * (1.0 + (ratio - 1.0) * scale), 1)
        carries[tier] = {c: row[c] for c in _BAG_ORDER_RAW}
    return carries


_BAG_ORDER_RAW = ["Driver", "3-Wood", "5-Wood", "4-Iron", "5-Iron", "6-Iron",
                  "7-Iron", "8-Iron", "9-Iron", "PW", "GW", "SW"]

_TIER_CARRIES = _build_tier_carries()

# Per-club DISTANCE consistency, relative to driver. Distance control is
# not uniform across the bag: mid-irons are the most repeatable club a
# golfer owns, while driver (more speed, more launch/spin variation) and
# wedges (more spin and strike sensitivity) scatter more. Measured from
# 565 real shots, as ratios to that golfer's driver CV:
#     5-Iron 0.63   6-Iron 0.61   7-Iron 0.65   Driver 1.00
#     3-Wood 0.95   5-Wood 0.96   PW 0.89   GW 1.06   SW 0.96
# The curve below smooths those (8-iron measured 1.03 on only 17 shots,
# clearly noise against three mid-irons all near 0.62).
#
# CAVEAT worth stating plainly: this shape comes from ONE golfer's data,
# because no published source breaks distance dispersion out by club --
# GOLFTEC and HackMotion both only publish 7-iron. The relative shape is
# physically sensible and consistent across three mid-irons with decent
# sample sizes, but it is the least externally-validated table here.
_CLUB_DISTANCE_RATIO = {
    "Driver": 1.00, "3-Wood": 0.95, "5-Wood": 0.93,
    "4-Iron": 0.75, "5-Iron": 0.65, "6-Iron": 0.63, "7-Iron": 0.65,
    "8-Iron": 0.72, "9-Iron": 0.80, "PW": 0.88, "GW": 0.95, "SW": 1.00,
}

# Canonical bag order, longest club to shortest. Used for menus and for
# interpolating user-supplied carries across the bag.
BAG_ORDER = list(_TIER_CARRIES["pro"].keys())


def _build_default_profiles() -> dict[str, dict[str, dict[str, float]]]:
    profiles = {}
    for tier, (driver_sd, base_cv) in _TIER_CALIBRATION.items():
        profiles[tier] = {}
        for club, carry in _TIER_CARRIES[tier].items():
            cv = base_cv * _CLUB_DISTANCE_RATIO[club]
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
    "tour": 0.4,
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
    "tour": 0.0,
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
    "tour": -4,
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


# E[|Z|] for a standard normal, used to add back the average distance
# lost to curving so the realized mean carry stays on target.
_HALF_NORMAL_MEAN = np.sqrt(2.0 / np.pi)   # ~0.7979
# How far the two-piece-normal skew shifts the mean, per unit of
# asymmetry, in SDs. For z scaled by (1+a) below zero and (1-a) above:
#   E[z_asym] = 0.3989*[-(1+a) + (1-a)] = -0.7979*a = -E[|Z|]*a
_SKEW_MEAN_SHIFT = _HALF_NORMAL_MEAN

# Upper-side carry spread, as a fraction of mean carry, held roughly
# constant across skill levels: a golfer's best strike is capped by
# clubhead speed, and a 20-handicap does not out-drive their own ceiling
# just because they are inconsistent. Set from real launch-monitor data
# where the best driver carry observed sat +10.8% above the mean and the
# 99th percentile at +8.2%; 0.04 puts P99 near +9%.
_UPPER_TAIL_CV = 0.040

# Hard-ish ceiling on carry as a multiple of mean, from measured data
# (best of 159 real driver shots was +10.8% of the mean).
_MAX_CARRY_RATIO = 1.11

# Floor on carry, expressed as this many distance-CVs below the mean.
# A full swing that makes contact does not lose a big chunk of its
# distance -- a half-length pitching wedge is a top or a chunk, which is
# a different event and not what this model represents.
#
# Scaled by the club's own CV rather than fixed, so a consistent player
# gets a tight floor while a wild one can genuinely come up short. At
# the measured driver CV of 0.039 this puts the floor near 90% of mean,
# and with the soft compression below it the realised worst shot lands
# around 88% -- which is exactly the worst of 162 real driver shots. A
# high-handicap CV of 0.11 gives a floor near 80%.
#
# Measured bound this is set from -- full swings only, this golfer:
#   Driver  n=159   0.0% below 90% of mean, worst 91%
#   7-Iron  n= 62   0.0% below 90% of mean, worst 90%
#   6-Iron  n= 34   0.0% below 90% of mean, worst 92%
# i.e. a full shot that finds the middle of the face essentially never
# loses a tenth of its distance.
_MIN_CARRY_K = 1.8

# Fraction of shots the drawn dispersion ellipse should contain.
_ELLIPSE_CONTAINMENT = 0.90

# Yards of carry gained per yard of LEFT curve (negative = draws fly
# farther, fades fly shorter). This is what tilts the dispersion ellipse
# diagonally instead of leaving it upright.
#
# TREAT THIS DEFAULT AS WEAK -- it is golfer-specific, and two datasets
# disagree on even the SIGN:
#   - 565 shots, one right-handed 2-handicap: -0.14 to -0.79 raw. With
#     ball speed controlled the effect shrinks to about -0.25, and the
#     gap wedge flips positive, so part of the raw number was a
#     ball-speed confound (faster swings both curve more and fly
#     farther).
#   - 796 shots, an independent golfer (Kaggle launch-monitor set, club
#     labels absent, handedness unknown): +0.07 to +0.27 controlled --
#     the opposite direction.
# What DOES replicate in both is the symmetric term: curving the ball in
# either direction costs carry once ball speed is held fixed.
#
# So the default is set modest and conservative rather than to either
# golfer's fitted value. calibrate.py fits this per club from real shots
# whenever they exist, and that fitted path is what reproduces a
# specific golfer's measured tilt.
_DEFAULT_CURVE_CARRY_SLOPE = -0.20

# Plot theme (advisor request): white figure, light-gray plot area, dark
# text. Club colors are darker/saturated so they stay readable on gray.
_BG = "#ffffff"
_AX_BG = "#e8e8e8"
_FG = "#222222"

# One fixed, high-contrast color per club, ordered so NEIGHBORING clubs
# (which overlap most on the plot) are far apart on the color wheel --
# the old sequential colormap gave 7-iron and 8-iron near-identical
# shades exactly where they overlap.
_CLUB_COLORS = {
    "Driver": "#d62728",   # red
    "3-Wood": "#e07b00",   # orange
    "5-Wood": "#a89400",   # olive
    "4-Iron": "#2ca02c",   # green
    "5-Iron": "#008fa3",   # teal
    "6-Iron": "#1f5fbf",   # blue
    "7-Iron": "#7b3fbf",   # purple
    "8-Iron": "#d81b7e",   # magenta
    "9-Iron": "#111111",   # near-black
    "PW": "#8c564b",       # brown
    "GW": "#d9a400",       # gold
    "SW": "#6b7280",       # gray
}
_FALLBACK_COLORS = list(_CLUB_COLORS.values())


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
        mishit_carry_loss: float = 0.10,
        carry_asymmetry: float | None = None,
        two_way_miss: bool = False,
        club_weights: dict[str, float] | None = None,
        improvement_per_session: float = 0.0,
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
        # Typical fraction of carry lost on a mishit (half-normal sigma).
        self.mishit_carry_loss = mishit_carry_loss

        # Carry asymmetry: fraction by which the SHORT side of the carry
        # distribution is stretched and the long side compressed, giving
        # the negative skew real shots have (chunks and thin strikes come
        # up short; almost nothing flies 20 yards past). 0 = symmetric.
        self.carry_asymmetry = carry_asymmetry

        # Two-way miss: a one-way player has a repeatable shot shape and
        # misses the same side most of the time; a two-way player's bias
        # flips sign shot to shot, so they miss both directions equally.
        # Two-way is harder to play from even at the same total spread,
        # and it removes any inherent directional bias from the model.
        self.two_way_miss = two_way_miss

        # Per-club skill weighting: 1.0 = tier-typical, <1 = this golfer
        # is unusually good with that club, >1 = unusually bad. Real
        # players are not uniformly skilled across the bag (Dillon's real
        # wedge dispersion is far tighter than his handicap tier implies).
        self.club_weights = club_weights or {}

        # Skill improvement: fractional reduction in directional spread
        # and session drift per completed session, so a golfer practicing
        # over many sessions tightens up instead of being static forever.
        self.improvement_per_session = improvement_per_session

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
        return cls.from_profile_dict(profiles, name=name, seed=seed, **kwargs)

    @classmethod
    def from_profile_dict(cls, profiles: dict, name: str = "calibrated", seed: int | None = None, **kwargs) -> "SyntheticGolfer":
        """Same as from_profile_json but takes the fitted profile dict
        directly (e.g. the output of calibrate.calibrate())."""
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

    def _asymmetry_for(self, cv: float) -> float:
        """Two-piece-normal asymmetry for a club with this distance CV.

        A golfer's BEST possible carry is capped by their clubhead speed,
        which barely varies -- so the upper edge of the carry distribution
        sits in about the same place no matter the skill level. What grows
        with handicap is the DOWNSIDE: more chunks, thins, and glancing
        strikes. So rather than one fixed asymmetry, the upper-side spread
        is pinned near _UPPER_TAIL_CV and all remaining variance is pushed
        into the lower tail.

        Without this a high-handicap driver produced 350-yard bombs off a
        250-yard average -- 4% of shots beyond +15%, where real
        launch-monitor data has literally none.
        """
        if self.carry_asymmetry is not None:
            return self.carry_asymmetry
        if cv <= _UPPER_TAIL_CV:
            return 0.05
        return float(np.clip(1.0 - _UPPER_TAIL_CV / cv, 0.05, 0.70))

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

            # Per-club skill weight and cumulative practice improvement
            # both scale directional spread. Improvement compounds per
            # completed session and floors at 40% of the starting spread
            # (nobody practices their way to zero dispersion).
            weight = self.club_weights.get(club, 1.0)
            session_idx = i // self.session_size
            improve = max(0.4, 1.0 - self.improvement_per_session * session_idx)
            spread = spread_mult * weight * improve

            # --- carry: ASYMMETRIC (negative skew) -------------------
            # Two-piece normal: draws below the mean get stretched, draws
            # above get compressed, so mishits come up short but almost
            # nothing flies way past. Matches the negative carry skew
            # measured in real launch-monitor data.
            mean_carry = profile["mean_carry"] * (
                1 + session_distance_scale
                + self.mishit_rate * self.mishit_carry_loss * _HALF_NORMAL_MEAN
            )
            # NOTE: distance_sd deliberately does NOT get spread_mult. A
            # mishit is a bad STRIKE -- it loses ball speed and therefore
            # carry. It cannot gain carry, so widening the distance
            # distribution symmetrically is wrong: it used to let a
            # mishit fly 60% PAST the mean. Real launch-monitor data has
            # no such shots (max driver carry observed was +10.8% of the
            # mean, and nothing at all beyond +15%). Mishits still spray
            # sideways -- spread_mult is applied to direction below.
            distance_sd = profile["mean_carry"] * profile["distance_cv"]
            a = self._asymmetry_for(profile["distance_cv"])
            z = self.rng.normal()
            z = z * (1.0 + a) if z < 0 else z * (1.0 - a)
            # Skewing pulls the average down, and curving costs distance
            # below. Both are added back so the REALIZED mean carry still
            # equals profile["mean_carry"] -- users enter their real carry
            # numbers and the simulation has to honor them.
            skew_offset = _SKEW_MEAN_SHIFT * a * distance_sd
            carry_yds = max(0.0, mean_carry + z * distance_sd + skew_offset)

            # One-sided strike penalty: fat/thin/toe/heel contact costs a
            # fraction of carry and never adds any. Drawn half-normal so
            # most mishits are moderate and a few are severe. The average
            # loss is added back into the mean above so a bag's realized
            # carry still matches what the user entered.
            if is_mishit:
                carry_yds *= 1.0 - abs(self.rng.normal(0.0, self.mishit_carry_loss))


            # --- direction: TWO components ---------------------------
            # start line (where it starts, an angle) + curve (how much it
            # bends in flight, in yards). Splitting total dispersion by
            # _CLUB_CURVE_SHARE keeps overall spread on its calibrated
            # value while giving the shot a real shape.
            # A calibrated profile stores the two components measured
            # directly from real shots; a default/interpolated profile
            # only has a combined direction_sd_deg, which gets split by
            # the club's curve share.
            if "start_line_sd_deg" in profile:
                start_sd_deg = profile["start_line_sd_deg"]
                curve_sd_pct = profile["curve_sd_pct"]
            else:
                curve_share = _CLUB_CURVE_SHARE.get(club, 0.5)
                total_sd_rad = np.radians(profile["direction_sd_deg"])
                start_sd_deg = np.degrees(total_sd_rad * np.sqrt(1.0 - curve_share))
                curve_sd_pct = total_sd_rad * np.sqrt(curve_share)

            # A one-way player's bias is a fixed tendency; a two-way
            # player's flips sign shot to shot, so they miss both sides
            # equally instead of having an inherent directional bias.
            # "direction_bias_deg" is what calibrate.py wrote before the
            # start-line/curve split; accept it so existing fitted
            # profiles keep their measured per-club bias.
            club_bias = profile.get("start_line_bias_deg")
            if club_bias is None:
                club_bias = profile.get("direction_bias_deg", 0.0)
            bias = self.golfer_bias_deg + club_bias
            if self.two_way_miss:
                bias = abs(bias) * self.rng.choice([-1.0, 1.0])

            start_line_deg = self.rng.normal(
                bias + session_direction_drift, start_sd_deg * spread
            )
            curve_yds = self.rng.normal(
                profile.get("curve_bias_pct", 0.0) * carry_yds,
                curve_sd_pct * carry_yds * spread,
            )

            # Curve and carry are linked DIRECTIONALLY, and this is what
            # tilts the dispersion ellipse. A draw is a lower-spin shot:
            # it flies and runs farther. A fade carries more backspin,
            # flies shorter, and lands steeper. So carry rises as the
            # ball curves left and falls as it curves right, which rotates
            # the point cloud instead of just stretching it.
            #
            # Every one of the golfer's 9 measured clubs showed this same
            # sign, averaging about -0.4 yds of carry per yd of curve. An
            # earlier version subtracted a cost based on ABS(curve), which
            # is symmetric and therefore produced a perfectly upright
            # ellipse -- measured tilt was -9 to -52 degrees, simulated
            # tilt was 0.
            slope = profile.get("curve_carry_slope", _DEFAULT_CURVE_CARRY_SLOPE)
            expected_curve = profile.get("curve_bias_pct", 0.0) * carry_yds
            carry_yds = max(0.0, carry_yds + slope * (curve_yds - expected_curve))

            # Physical ceiling. Carry is capped by clubhead speed, and no
            # amount of inconsistency lets a golfer exceed their own best
            # strike -- 159 real driver shots topped out at +10.8% of the
            # mean with nothing past +15%. Above the ceiling the excess is
            # compressed rather than hard-clipped, so a rare flier still
            # exists but 350-yard bombs off a 250-yard average do not.
            ceiling = mean_carry * _MAX_CARRY_RATIO
            if carry_yds > ceiling:
                carry_yds = ceiling + (carry_yds - ceiling) * 0.15

            # Physical FLOOR, same idea in the other direction. A full
            # swing that makes contact does not lose half its distance --
            # a 65-yard pitching wedge is a topped or chunked shot, which
            # is a different event from a bad strike and is not what this
            # model represents. Across 162 real driver shots the worst
            # was 88% of the mean; full-swing irons bottomed out near
            # 82%. Excess below the floor is compressed, not clipped, so
            # a bad one still exists without being absurd.
            # Floor is taken off the profile mean, not the drifted
            # session mean, so a cold session cannot quietly drag it
            # down. Compression below it is tighter than the ceiling's
            # because the measured lower bound is much harder: across
            # 159 driver and 62 7-iron shots, NOTHING came in below 90%
            # of the mean.
            #
            # This floor represents a normal full swing that makes clean
            # contact -- the range data it's measured from doesn't contain
            # real duffs (those happen on course, not on a mat). A shot
            # already flagged is_mishit has its own one-sided strike
            # penalty above (line ~688) specifically to let a true chunk
            # or thin go meaningfully short; squashing it back up to this
            # floor would cancel that out and make every mishit land in
            # a near-identical spot just below the floor line. So mishits
            # skip this clamp entirely.
            #
            # For everyone else: a fixed-ratio linear squash (the original
            # approach) ALWAYS produces a visible density spike right at
            # the floor, no matter how loose the ratio -- it compresses a
            # wide spread of raw deficits into a narrow output band, so
            # probability mass piles up there. Tightening or loosening the
            # ratio only changes how bad the spike looks, never removes
            # it (confirmed empirically: 0.12 still visibly walled).
            # A smooth exponential taper fixes this properly: its slope
            # matches the unclamped side (=1) exactly at the floor, so
            # there's no seam for density to pile up against, and it
            # asymptotically approaches floor - TAPER_SCALE for a severe
            # outlier instead of hard-compressing everything below floor
            # into a sliver.
            floor = profile["mean_carry"] * (1.0 - _MIN_CARRY_K * profile["distance_cv"])
            if carry_yds < floor and not is_mishit:
                deficit = floor - carry_yds
                taper_scale = floor * 0.05
                carry_yds = floor - taper_scale * (1.0 - np.exp(-deficit / taper_scale))

            offline_yds = carry_yds * np.tan(np.radians(start_line_deg)) + curve_yds
            direction_deg = np.degrees(np.arctan2(offline_yds, max(carry_yds, 1e-6)))

            rows.append(
                {
                    "shot_id": i,
                    "session_id": session_idx,
                    "skill_level": self.skill_level,
                    "club": club,
                    "carry_yds": round(carry_yds, 1),
                    "offline_yds": round(offline_yds, 2),
                    "start_line_deg": round(start_line_deg, 2),
                    "curve_yds": round(curve_yds, 2),
                    "direction_deg": round(direction_deg, 2),
                    "is_mishit": is_mishit,
                }
            )

        return pd.DataFrame(rows)

    def plot_dispersion(self, df: pd.DataFrame, save_path: str | None = None,
                        show_ellipses: bool | None = None):
        """Scatter plot of offline vs. carry, drawn over a simple range visual.

        show_ellipses: draw a 90% containment ellipse per club. None
        (default) turns them on only when 5 or fewer clubs are plotted.
        """
        import matplotlib.pyplot as plt

        max_dist = float(df["carry_yds"].max()) * 1.15
        max_offline = float(df["offline_yds"].abs().max()) * 1.15
        half_width = max(max_offline, max_dist * 0.18)

        # Equal aspect: this is a MAP of where balls landed, so a yard
        # sideways has to look the same size as a yard downrange. With
        # matplotlib's default independent auto-scaling, a single-club
        # plot stretched the narrow offline axis to fill the frame and
        # made a 7-iron pattern look about twice as wide as it is. The
        # figure is sized from the data extent so the axes fill it
        # instead of sitting in a band of dead space.
        y_lo, y_hi = -10, max_dist
        span_x, span_y = 2 * half_width, y_hi - y_lo
        fig_h = 11.0
        fig_w = float(np.clip(fig_h * span_x / span_y, 3.5, 13.0)) + 2.2  # +legend
        fig, ax = plt.subplots(figsize=(fig_w, fig_h), facecolor=_BG)
        ax.set_facecolor(_AX_BG)
        ax.set_xlim(-half_width, half_width)
        ax.set_ylim(y_lo, y_hi)
        ax.set_aspect("equal", adjustable="box")
        for spine in ax.spines.values():
            spine.set_color("#999999")
        ax.tick_params(colors=_FG, labelsize=8)

        for d in range(50, int(max_dist) + 50, 50):
            ax.axhline(d, color="white", alpha=0.9, linewidth=1.0, zorder=1)
            ax.text(-half_width * 0.98, d, f"{d}y", color=_FG, alpha=0.6, fontsize=7, va="bottom")

        ax.axvline(0, color=_FG, linestyle="--", alpha=0.5, linewidth=1, zorder=1)
        ax.scatter(0, 0, color=_FG, marker="s", s=40, zorder=3, label="Tee")

        # Marker size/opacity scale with shot count: 10k shots need small
        # faint dots to show density, but a 100-shot session needs big
        # bright ones or the pattern is barely visible.
        n = len(df)
        size = float(np.clip(6000 / n, 10, 70))
        alpha = float(np.clip(120 / n, 0.5, 0.95))

        clubs = list(df["club"].unique())
        for idx, club in enumerate(clubs):
            group = df[df["club"] == club]
            ax.scatter(
                group["offline_yds"],
                group["carry_yds"],
                s=size,
                alpha=alpha,
                color=_CLUB_COLORS.get(club, _FALLBACK_COLORS[idx % len(_FALLBACK_COLORS)]),
                label=club,
                zorder=2,
                edgecolors="black" if n <= 500 else "none",
                linewidths=0.4,
            )

        # Dispersion ellipse per club, the way published shot-pattern
        # graphics draw them. Only with a few clubs selected -- a dozen
        # overlapping ellipses is unreadable. The ellipse is the 90%
        # containment contour of the fitted 2-D normal: its axes are the
        # eigenvectors of the offline/carry covariance, so it picks up
        # the pattern's TILT rather than sitting upright.
        if show_ellipses is None:
            show_ellipses = len(clubs) <= 5
        if show_ellipses:
            from matplotlib.patches import Ellipse

            # For a 2-D normal, the contour containing fraction p sits at
            # radius sqrt(-2 ln(1-p)) in standard-deviation units.
            k = float(np.sqrt(-2.0 * np.log(1.0 - _ELLIPSE_CONTAINMENT)))
            for idx, club in enumerate(clubs):
                grp = df[df["club"] == club]
                if len(grp) < 10:
                    continue
                cov = np.cov(grp["offline_yds"], grp["carry_yds"])
                vals, vecs = np.linalg.eigh(cov)
                order = np.argsort(vals)[::-1]
                vals, vecs = vals[order], vecs[:, order]
                angle = np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0]))
                color = _CLUB_COLORS.get(club, _FALLBACK_COLORS[idx % len(_FALLBACK_COLORS)])
                ax.add_patch(Ellipse(
                    (grp["offline_yds"].mean(), grp["carry_yds"].mean()),
                    width=2 * k * np.sqrt(vals[0]),
                    height=2 * k * np.sqrt(vals[1]),
                    angle=angle,
                    facecolor="none", edgecolor=color,
                    linewidth=1.6, alpha=0.9, zorder=4,
                ))

        ax.set_xlabel("Offline (yds) — left (–) / right (+)", color=_FG)
        ax.set_ylabel("Carry distance (yds)", color=_FG)
        ax.set_title(f"{len(df):,} synthetic shots — {self.skill_level}", color=_FG)
        leg = ax.legend(markerscale=2.5, loc="upper left", bbox_to_anchor=(1.02, 1),
                        fontsize=8, facecolor="white", edgecolor="#999999", labelcolor=_FG)
        leg.get_frame().set_alpha(0.95)
        fig.tight_layout()

        if save_path:
            fig.savefig(save_path, dpi=150)
        return fig
