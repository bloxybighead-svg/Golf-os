-- ============================================================
-- Golf OS — Simulated Shots: example queries
-- Run against simulated_shots_schema.sql + simulated_shots_views.sql
-- ============================================================

-- 1. Full-bag dispersion summary, longest to shortest.
select club, n_shots, carry_mean, carry_sd, carry_p10, carry_p90, offline_sd, mishit_pct
from club_dispersion
where golfer_name = 'Dillon Cady' and source_label = 'calibrated'
order by carry_mean desc;

-- 2. Gapping problems: club pairs whose 10th-90th percentile carry ranges
-- overlap by more than 30% — a real "which one do I hit" ambiguity, not
-- just a small average gap.
select shorter_club, longer_club, shorter_mean, longer_mean, mean_gap_yds, overlap_yds, overlap_pct_of_narrower_range
from club_gapping_overlap
where golfer_name = 'Dillon Cady' and source_label = 'calibrated'
  and overlap_pct_of_narrower_range > 30
order by overlap_pct_of_narrower_range desc;

-- 3. Club recommendation for a target carry (e.g. a 155-yard approach):
-- ranks clubs by how close their mean carry is to the target.
select club, carry_mean, carry_p10, carry_p90,
       abs(carry_mean - 155) as diff_from_target_yds
from club_dispersion
where golfer_name = 'Dillon Cady' and source_label = 'calibrated'
order by diff_from_target_yds asc
limit 3;

-- 4. "What can I trust to clear it?" — for a hazard carry (e.g. 150 yards
-- of water), the shortest club whose floor (p10) still clears the number,
-- not just its average.
select club, carry_mean, carry_p10, carry_sd
from club_dispersion
where golfer_name = 'Dillon Cady' and source_label = 'calibrated'
  and carry_p10 >= 150
order by carry_mean asc
limit 1;

-- 5. Miss tendency per club — average offline value (+ = right, - = left)
-- and its spread. Tells you whether to bias your aim for a given club.
select club,
       round(avg(offline_yds)::numeric, 1) as avg_offline_bias_yds,
       round(stddev_samp(offline_yds)::numeric, 1) as offline_sd
from simulated_shots s
join golfer_profiles p on p.id = s.golfer_profile_id
where p.golfer_name = 'Dillon Cady' and p.source_label = 'calibrated'
group by club
order by club;

-- 6. Worst-case (P90) dispersion box per club — half-width in yards you'd
-- need on a green/fairway to have a 90% chance of a shot with this club
-- landing inside it, both directions.
select club,
       (carry_p90 - carry_p10) as carry_range_yds,
       (offline_p90 - offline_p10) as offline_range_yds
from club_dispersion
where golfer_name = 'Dillon Cady' and source_label = 'calibrated'
order by carry_mean desc;
