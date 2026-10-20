-- Applied to project clgjzoedmtguchilmkdj on 2026-09-26 (migration: simulator_tables_read_only_rls).
-- Simulator tables become public READ-ONLY. The browser (anon key) can no longer insert/update/delete;
-- seed scripts must use the service-role key. This supersedes the "disable row level security"
-- lines in simulated_shots_schema.sql and real_shots_schema.sql.

alter table public.golfer_profiles enable row level security;
alter table public.simulated_shots enable row level security;
alter table public.real_shots enable row level security;

drop policy if exists "public read golfer_profiles" on public.golfer_profiles;
drop policy if exists "public read simulated_shots" on public.simulated_shots;
drop policy if exists "public read real_shots" on public.real_shots;

create policy "public read golfer_profiles" on public.golfer_profiles for select to anon, authenticated using (true);
create policy "public read simulated_shots" on public.simulated_shots for select to anon, authenticated using (true);
create policy "public read real_shots" on public.real_shots for select to anon, authenticated using (true);

-- Views must run with the caller's permissions so RLS applies.
alter view public.club_dispersion set (security_invoker = true);
alter view public.club_gapping_overlap set (security_invoker = true);
