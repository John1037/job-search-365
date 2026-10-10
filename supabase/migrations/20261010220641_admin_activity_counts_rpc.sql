-- Aggregation RPC powering the admin activity dashboard: one call per
-- (time range, bucket granularity) selection returns everything the page
-- needs (stat tiles, the time-series chart, and the action-type breakdown
-- are all derived client-side from these rows).
--
-- security invoker (not definer) is deliberate: it reuses activity_log's
-- own RLS policy (admin/owner permission_level required to read any row)
-- instead of duplicating that check here. A non-admin calling this gets an
-- empty result, exactly as a direct SELECT against the table would.

create or replace function public.admin_activity_counts(
  start_date timestamptz,
  end_date timestamptz,
  bucket text default 'day'
)
returns table (bucket_start timestamptz, action text, count bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select date_trunc(bucket, created_at) as bucket_start, action, count(*) as count
  from public.activity_log
  where created_at >= start_date and created_at < end_date
  group by 1, 2
  order by 1, 2;
$$;

grant execute on function public.admin_activity_counts(timestamptz, timestamptz, text) to authenticated;
