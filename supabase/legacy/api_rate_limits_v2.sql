-- Rate limits v2: stop deleting on every call. Run once in the Supabase SQL
-- editor (project clgjzoedmtguchilmkdj), after api_rate_limits.sql.
--
-- v1 ran `delete from api_rate_limits where window_start < now() - 1 hour` on
-- every hit_rate_limit() call: a table-wide delete per request. Now the
-- function only does its upsert (an expired window for the caller's own bucket
-- already restarts at 1), and pg_cron clears old rows every 15 minutes.
--
-- If `create extension pg_cron` fails on your project, skip the cron block:
-- the table still stays small, because each bucket is one row that is reused
-- (only buckets for IPs/users that never come back linger).

create or replace function public.hit_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  insert into public.api_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- Cleanup every 15 minutes. One hour is the longest window in use.
create extension if not exists pg_cron;

select cron.unschedule('api-rate-limits-cleanup')
where exists (select 1 from cron.job where jobname = 'api-rate-limits-cleanup');

select cron.schedule(
  'api-rate-limits-cleanup',
  '*/15 * * * *',
  $$delete from public.api_rate_limits where window_start < now() - interval '1 hour'$$
);
