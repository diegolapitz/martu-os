-- Supabase-only capabilities. The local PGlite migration runner intentionally
-- skips files ending in _supabase_cloud.sql.

create schema if not exists extensions;
create schema if not exists vault;

create extension if not exists vector with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Supabase normally installs pgvector in `extensions`, but existing projects
-- can have it in `public`. Normalize the schema before referencing its type.
-- Supabase manages extension versions; running `alter extension ... update`
-- inside a CLI migration trips the platform pgaudit hook on fresh projects.
do $$
declare
  v_vector_schema text;
begin
  select n.nspname into v_vector_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'vector';

  if v_vector_schema is distinct from 'extensions' then
    alter extension vector set schema extensions;
  end if;
end;
$$;

alter table public.memories
  add column if not exists embedding extensions.vector(1536);

create index if not exists memories_embedding_hnsw_idx
  on public.memories
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create or replace function public.configure_martu_scheduler(
  p_app_url text,
  p_cron_secret text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_app_url_id uuid;
  v_cron_secret_id uuid;
  v_existing_job bigint;
  v_cleanup_job bigint;
begin
  if nullif(btrim(p_app_url), '') is null then
    raise exception 'p_app_url is required';
  end if;

  if nullif(btrim(p_cron_secret), '') is null then
    raise exception 'p_cron_secret is required';
  end if;

  select id into v_app_url_id
  from vault.secrets
  where name = 'martu_os_app_url';

  if v_app_url_id is null then
    perform vault.create_secret(
      rtrim(p_app_url, '/'),
      'martu_os_app_url',
      'Base URL of the Vercel Martu OS deployment'
    );
  else
    perform vault.update_secret(
      v_app_url_id,
      rtrim(p_app_url, '/'),
      'martu_os_app_url',
      'Base URL of the Vercel Martu OS deployment'
    );
  end if;

  select id into v_cron_secret_id
  from vault.secrets
  where name = 'martu_os_cron_secret';

  if v_cron_secret_id is null then
    perform vault.create_secret(
      p_cron_secret,
      'martu_os_cron_secret',
      'Bearer secret accepted by /api/scheduler/tick'
    );
  else
    perform vault.update_secret(
      v_cron_secret_id,
      p_cron_secret,
      'martu_os_cron_secret',
      'Bearer secret accepted by /api/scheduler/tick'
    );
  end if;

  select jobid into v_existing_job
  from cron.job
  where jobname = 'martu-os-scheduler-tick';

  if v_existing_job is not null then
    perform cron.unschedule(v_existing_job);
  end if;

  perform cron.schedule(
    'martu-os-scheduler-tick',
    '* * * * *',
    $schedule$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'martu_os_app_url'
        ) || '/api/scheduler/tick',
        headers := jsonb_strip_nulls(jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'martu_os_cron_secret'
          ),
          'x-vercel-protection-bypass', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'martu_os_vercel_bypass_secret'
          )
        )),
        body := jsonb_build_object(
          'source', 'supabase-cron',
          'sentAt', now()
        ),
        timeout_milliseconds := 10000
      );
    $schedule$
  );

  select jobid into v_cleanup_job
  from cron.job
  where jobname = 'martu-os-cron-history-cleanup';

  if v_cleanup_job is not null then
    perform cron.unschedule(v_cleanup_job);
  end if;

  perform cron.schedule(
    'martu-os-cron-history-cleanup',
    '17 3 * * *',
    $cleanup$
      delete from cron.job_run_details
      where end_time < now() - interval '30 days';
    $cleanup$
  );
end;
$$;

revoke all on function public.configure_martu_scheduler(text, text)
  from public, anon, authenticated, service_role;

-- No client-side Data API access in V0. The direct database role used by the
-- Vercel backend remains the sole writer/reader.
revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;
revoke all on all functions in schema public from anon, authenticated, service_role;

alter default privileges in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated, service_role;
