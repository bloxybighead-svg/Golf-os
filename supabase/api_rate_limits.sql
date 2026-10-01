-- Rate limits for the course API routes (session 14). Run once in the Supabase
-- SQL editor (project clgjzoedmtguchilmkdj).
--
-- Who can touch this: nobody but the server. RLS is enabled with NO policies,
-- so the anon and authenticated roles can neither read nor write the table,
-- and the function is executable by service_role only -- the anon key is
-- public, so if anon could call it, anyone could fill a victim's bucket or
-- spam rows. The Next.js API routes call it with SUPABASE_SERVICE_ROLE_KEY
-- (server-only, never NEXT_PUBLIC_).

create table if not exists public.api_rate_limits (
  bucket text primary key,          -- e.g. "search:ip:203.0.113.7", "geometry-miss:user:<uuid>"
  window_start timestamptz not null,
  hits integer not null
);

alter table public.api_rate_limits enable row level security;
-- (no policies on purpose)
revoke all on public.api_rate_limits from anon, authenticated;

-- Counts one hit on `p_bucket` and says whether it is within `p_max` hits per
-- `p_window_seconds`. The check and the increment are one INSERT ... ON
-- CONFLICT DO UPDATE, which takes a row lock, so two requests at the same
-- moment are counted one after the other and can't both slip under the limit.
-- A window that has run out starts again at 1. Rows older than an hour (the
-- longest window in use) are deleted on every call, so the table stays small.
create or replace function public.hit_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  delete from public.api_rate_limits where window_start < now() - interval '1 hour';

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
