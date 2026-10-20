-- Session 16: ground heights per hole, for "plays like" distances.
-- Cache of elevation (feet) at the sample points along a hole, so USGS / Open-Meteo
-- are asked once per hole, ever (the ground does not move). Public read; writes only
-- with the service-role key (which bypasses RLS), so nobody can poison it.
-- Shared reference data, not per-golfer: same pattern as course_geometry
-- (supabase/course_geometry_cache.sql), not the owner-only policies of per_user_data.sql.
create table if not exists public.course_elevation (
  course_key text not null,             -- e.g. "ogapi:<OpenGolfAPI course id>"
  hole_id text not null,                -- the hole's OSM way id, e.g. "way/917183416"
  points jsonb not null,                -- [{lat, lng}] the heights were looked up for
  elevations_ft jsonb not null,         -- [number|null], same order as points
  source text not null,                 -- 'usgs' or 'open-meteo'
  fetched_at timestamptz not null default now(),
  primary key (course_key, hole_id)
);

alter table public.course_elevation enable row level security;

drop policy if exists "public read course_elevation" on public.course_elevation;
create policy "public read course_elevation" on public.course_elevation
  for select to anon, authenticated using (true);
