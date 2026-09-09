-- ============================================================
-- Golf OS — Simulated Shots: dispersion + club-gapping views
-- Run this in Supabase Dashboard → SQL Editor, after
-- simulated_shots_schema.sql
-- ============================================================

-- Per-club dispersion: mean, SD, and percentiles for carry and offline
-- distance, plus mishit rate. This is the one view most other queries
-- build on.
create or replace view club_dispersion as
select
  p.golfer_name,
  p.source_label,
  s.club,
  count(*)                                                                        as n_shots,
  round(avg(s.carry_yds)::numeric, 1)                                             as carry_mean,
  round(stddev_samp(s.carry_yds)::numeric, 1)                                     as carry_sd,
  round((percentile_cont(0.10) within group (order by s.carry_yds))::numeric, 1)   as carry_p10,
  round((percentile_cont(0.50) within group (order by s.carry_yds))::numeric, 1)   as carry_p50,
  round((percentile_cont(0.90) within group (order by s.carry_yds))::numeric, 1)   as carry_p90,
  round(stddev_samp(s.offline_yds)::numeric, 1)                                   as offline_sd,
  round((percentile_cont(0.10) within group (order by s.offline_yds))::numeric, 1) as offline_p10,
  round((percentile_cont(0.50) within group (order by s.offline_yds))::numeric, 1) as offline_p50,
  round((percentile_cont(0.90) within group (order by s.offline_yds))::numeric, 1) as offline_p90,
  round((100.0 * sum((s.is_mishit)::int) / count(*))::numeric, 1)                  as mishit_pct
from simulated_shots s
join golfer_profiles p on p.id = s.golfer_profile_id
group by p.golfer_name, p.source_label, s.club;

-- Club-pairing overlap: for every pair of clubs (same golfer + profile),
-- how much their 10th-90th percentile carry ranges overlap. A high
-- overlap % means the two clubs aren't meaningfully different in
-- practice — a real "which one do I hit" problem, not just a small gap
-- in average distance.
create or replace view club_gapping_overlap as
select
  a.golfer_name,
  a.source_label,
  a.club as shorter_club,
  b.club as longer_club,
  a.carry_mean as shorter_mean,
  b.carry_mean as longer_mean,
  round(b.carry_mean - a.carry_mean, 1) as mean_gap_yds,
  greatest(a.carry_p10, b.carry_p10)                                                                as overlap_start_yds,
  least(a.carry_p90, b.carry_p90)                                                                    as overlap_end_yds,
  greatest(least(a.carry_p90, b.carry_p90) - greatest(a.carry_p10, b.carry_p10), 0)                   as overlap_yds,
  round(
    100.0 * greatest(least(a.carry_p90, b.carry_p90) - greatest(a.carry_p10, b.carry_p10), 0)
    / least(a.carry_p90 - a.carry_p10, b.carry_p90 - b.carry_p10),
    1
  ) as overlap_pct_of_narrower_range
from club_dispersion a
join club_dispersion b
  on a.golfer_name   = b.golfer_name
 and a.source_label  = b.source_label
 and a.carry_mean    < b.carry_mean
order by a.golfer_name, a.source_label, overlap_pct_of_narrower_range desc nulls last;
