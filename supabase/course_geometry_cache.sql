-- Applied to project clgjzoedmtguchilmkdj on 2026-09-26 (migration: course_geometry_cache).
-- Cache of OpenStreetMap course geometry so the planner doesn't depend on the
-- (often busy) public Overpass servers for every load. Public read; writes only
-- with the service-role key (which bypasses RLS), so nobody can poison it.
create table if not exists public.course_geometry (
  course_key text primary key,          -- e.g. "ogapi:<OpenGolfAPI course id>"
  name text,
  lat double precision,
  lng double precision,
  geometry jsonb not null,              -- CourseGeometry (holes, features, coast, scope)
  fetched_at timestamptz not null default now()
);

alter table public.course_geometry enable row level security;

drop policy if exists "public read course_geometry" on public.course_geometry;
create policy "public read course_geometry" on public.course_geometry
  for select to anon, authenticated using (true);
