-- Idempotent scheduler setup template.
--
-- This file intentionally contains no URL or secret. Before running it in the
-- same SQL session, set these transaction-local settings from your secret
-- manager or psql variables:
--
--   begin;
--   select set_config('app.martu_os_app_url', '<APP_URL>', true);
--   select set_config('app.martu_os_cron_secret', '<CRON_SECRET>', true);
--   \i supabase/setup-cron.sql
--   commit;
--
-- In the Supabase SQL editor, replace the two set_config values in a private
-- scratch query, append this DO block, run once, and do not save the scratch.
-- Prefer `pnpm db:cron:setup`, which performs the same operation through the
-- direct connection without printing either value.

do $$
declare
  v_app_url text := current_setting('app.martu_os_app_url', true);
  v_cron_secret text := current_setting('app.martu_os_cron_secret', true);
begin
  if nullif(btrim(v_app_url), '') is null then
    raise exception 'Set app.martu_os_app_url in this transaction first';
  end if;

  if nullif(btrim(v_cron_secret), '') is null then
    raise exception 'Set app.martu_os_cron_secret in this transaction first';
  end if;

  perform public.configure_martu_scheduler(v_app_url, v_cron_secret);
end;
$$;
