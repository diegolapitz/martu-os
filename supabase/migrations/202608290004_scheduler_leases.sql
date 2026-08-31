-- Distributed leases serialize scheduler-side effects across overlapping
-- Vercel/Supabase Cron invocations. The row is backend-only and expires
-- automatically; no process-local lock is involved.
create table if not exists public.scheduler_leases (
  user_id bigint not null references public.users(id) on delete cascade,
  resource text not null,
  owner_token text not null,
  lease_until timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, resource),
  constraint scheduler_leases_resource_not_blank check (btrim(resource) <> ''),
  constraint scheduler_leases_owner_not_blank check (btrim(owner_token) <> '')
);

create index if not exists scheduler_leases_expiry_idx
  on public.scheduler_leases (lease_until);

alter table public.scheduler_leases enable row level security;
