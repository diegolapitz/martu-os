-- Defense in depth for projects that may already have applied the first cloud
-- migration. Scheduler configuration is an operator-only SQL action; it must
-- never be callable through Supabase's Data API roles.
alter function public.configure_martu_scheduler(text, text) security invoker;

revoke all on function public.configure_martu_scheduler(text, text)
  from public, anon, authenticated, service_role;

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

revoke all on all tables in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;
revoke all on all functions in schema public from anon, authenticated, service_role;

alter default privileges in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public
  revoke execute on functions from anon, authenticated, service_role;
