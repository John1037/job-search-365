-- Automatic 0-100 CV-fit score, computed whenever a job's description is
-- set or changed. Mirrors the existing on_auth_user_email_changed ->
-- notify-email-changed pattern (trigger + pg_net webhook call), with one
-- deliberate difference: that precedent hardcodes its webhook secret as a
-- literal string in the trigger function body (live-DB only, but still bad
-- practice, and the reason it ended up exposed in an unrelated
-- conversation). This trigger never writes the secret value into any file,
-- migration included — it's stored once, live, in Supabase Vault (hosted
-- Supabase doesn't grant ALTER DATABASE ... SET on custom GUCs, so that
-- was the original plan; Vault is the supported equivalent), read back via
-- vault.decrypted_secrets, the same way Edge Function secrets are set via
-- `supabase secrets set` and never committed.

alter table public.jobs
  add column match_score integer check (match_score between 0 and 100);

create or replace function public.notify_job_description_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_secret text;
begin
  if new.description is null then
    -- Description was cleared — the old score no longer means anything.
    new.match_score := null;
  elsif TG_OP = 'INSERT' or new.description is distinct from old.description then
    select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'job_match_webhook_secret';

    perform net.http_post(
      url := 'https://toooxqjemmhiexiuflcq.supabase.co/functions/v1/job-match-rating',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Webhook-Secret', webhook_secret
      ),
      body := jsonb_build_object('job_id', new.id)
    );
  end if;
  return new;
end;
$$;

create trigger trg_job_description_changed
before insert or update on public.jobs
for each row execute function public.notify_job_description_changed();
