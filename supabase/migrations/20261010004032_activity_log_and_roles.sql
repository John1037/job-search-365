-- Account roles (owner/admin/user) and an activity log admins can read
-- across all users — the first role-based (not per-row auth.uid()-owned)
-- data in this project. Every other table is scoped strictly to its own
-- owner via RLS; this is a deliberate, narrow exception for admin access.

-- --- 1. profiles.permission_level ---------------------------------------------

alter table public.profiles
  add column permission_level text not null default 'user'
  check (permission_level in ('user', 'admin', 'owner'));

-- Prevent self-escalation: a user's own client-side update to their profile
-- row (e.g. EditProfile.jsx's upsert) must never be able to touch this
-- column, regardless of what RLS otherwise allows on the rest of the row.
-- This is a column-privilege revoke, independent of and in addition to
-- whatever RLS policy already governs updates to this table.
revoke update (permission_level) on public.profiles from authenticated;

update public.profiles set permission_level = 'owner'
where id = (select id from auth.users where email = 'j.mcmanus37@gmail.com');

-- --- 2. activity_log ---------------------------------------------------

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_user_id_idx on public.activity_log(user_id);
create index activity_log_action_idx on public.activity_log(action);
create index activity_log_created_at_idx on public.activity_log(created_at desc);

alter table public.activity_log enable row level security;

-- No insert/update/delete policy for authenticated/anon at all — the only
-- way a row gets written is a SECURITY DEFINER trigger function below, or
-- an edge function's service-role client. Regular users have zero write
-- access, so they can't forge or suppress log entries.
create policy "admins and owner can read all activity" on public.activity_log
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.permission_level in ('admin', 'owner')
    )
  );

-- --- 3. Generic trigger function, reused per table ----------------------
-- Captures the whole row as `details` via to_jsonb — no per-table payload
-- mapping needed. The action name is passed as a trigger argument, so
-- logging a new table later is just one more CREATE TRIGGER statement.

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (user_id, action, details)
  values (
    coalesce(NEW.user_id, OLD.user_id),
    TG_ARGV[0],
    to_jsonb(coalesce(NEW, OLD))
  );
  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_log_job_added after insert on public.jobs
  for each row execute function public.log_activity('job_added');

create trigger trg_log_job_deleted after delete on public.jobs
  for each row execute function public.log_activity('job_deleted');

create trigger trg_log_event_added after insert on public.events
  for each row execute function public.log_activity('event_added');

create trigger trg_log_document_deleted after delete on public.documents
  for each row execute function public.log_activity('document_deleted');

-- auth.users has a different row shape (no user_id column — the row's own
-- id IS the user id), so it gets its own small trigger function rather than
-- being forced through log_activity().
create or replace function public.log_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (user_id, action, details)
  values (NEW.id, 'user_signed_up', jsonb_build_object('email', NEW.email));
  return NEW;
end;
$$;

create trigger on_auth_user_signed_up after insert on auth.users
  for each row execute function public.log_user_signup();
