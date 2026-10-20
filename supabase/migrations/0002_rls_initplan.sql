-- Wrap auth.uid() in (select auth.uid()) in every public policy, so Postgres evaluates it once per
-- query instead of once per row (the Supabase "auth_rls_initplan" advisor). Same semantics.
--
-- ALTER POLICY rewrites only the USING / WITH CHECK expressions; each policy keeps its name, command
-- and roles. The loop reads the stored expressions, so it also covers any policy that exists in the
-- database but not in 0001, and it does nothing for a policy already wrapped (safe to run twice).
do $$
declare
  p record;
  new_using text;
  new_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ 'auth\.uid\(\)' or with_check ~ 'auth\.uid\(\)')
      and coalesce(qual, '') !~* 'select auth\.uid\(\)'
      and coalesce(with_check, '') !~* 'select auth\.uid\(\)'
  loop
    new_using := replace(p.qual, 'auth.uid()', '(select auth.uid())');
    new_check := replace(p.with_check, 'auth.uid()', '(select auth.uid())');
    execute format(
      'alter policy %I on %I.%I%s%s',
      p.policyname, p.schemaname, p.tablename,
      case when new_using is not null then format(' using (%s)', new_using) else '' end,
      case when new_check is not null then format(' with check (%s)', new_check) else '' end
    );
  end loop;
end $$;
