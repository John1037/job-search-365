-- Fixes a real gap found by testing, not just inspecting the SQL: the
-- previous migration's `revoke update (permission_level) ... from
-- authenticated` turned out to be a no-op. REVOKE on a specific column only
-- undoes a prior *column-level* GRANT for that role — it cannot override a
-- broader table-level UPDATE grant, which Supabase's default setup already
-- gives `authenticated` on every public table (RLS is meant to do the real
-- row-level restricting, not column grants). Confirmed directly:
-- `select has_column_privilege('authenticated', 'public.profiles',
-- 'permission_level', 'UPDATE')` returned true even after that revoke.
--
-- A BEFORE UPDATE trigger doesn't have this gap — it fires on every UPDATE
-- regardless of which grant authorized the statement to run at all, so it
-- can veto a change to this one column unconditionally. This intentionally
-- blocks ALL normal-path changes to permission_level, including from a
-- future service-role-backed admin feature — promoting/demoting someone is,
-- for now, a direct-database-connection-only action (as the initial owner
-- assignment already was). Revisit if/when an in-app promotion flow is
-- actually built.

create or replace function public.protect_permission_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.permission_level is distinct from OLD.permission_level then
    raise exception
      'permission_level cannot be changed via a normal update; use a direct database connection';
  end if;
  return NEW;
end;
$$;

create trigger trg_protect_permission_level
before update on public.profiles
for each row execute function public.protect_permission_level();
