-- Session 13c, step 3 of 3: stop publishing personal shot data. Run AFTER the
-- session 13c code is deployed (the code before it reads these tables with the
-- anon key, and would lose them), and after shot_data_13c_migrate_dillon.sql.
--
-- real_shots        no public read at all: owners read their own rows only
--                   (the "select own real_shots" policy from step 1).
-- golfer_profiles   public read stays ONLY for the synthetic handicap / band /
-- simulated_shots   tier golfers that the Compare page lists; calibrated
--                   (real golfer) profiles and their shots are owner-less now,
--                   so nobody can read them through the API.
-- Supersedes the three "public read" policies in simulator_rls_migration.sql.

drop policy if exists "public read real_shots" on public.real_shots;

drop policy if exists "public read golfer_profiles" on public.golfer_profiles;
create policy "public read golfer_profiles" on public.golfer_profiles
  for select to anon, authenticated using (source <> 'calibrated');

drop policy if exists "public read simulated_shots" on public.simulated_shots;
create policy "public read simulated_shots" on public.simulated_shots
  for select to anon, authenticated using (
    exists (select 1 from public.golfer_profiles p where p.id = golfer_profile_id and p.source <> 'calibrated')
  );
