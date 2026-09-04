-- Martu OS first-run foundation: map Supabase Auth identities to one personal
-- workspace per public.users row. auth_user_id is text so the same migration
-- remains executable in the PGlite development database.

alter table public.users
  add column if not exists auth_user_id text,
  add column if not exists preferred_name text,
  add column if not exists avatar_url text,
  add column if not exists profile_description text not null default '';

update public.users
set preferred_name = name
where preferred_name is null or btrim(preferred_name) = '';

create unique index if not exists users_auth_user_id_unique
  on public.users (auth_user_id)
  where auth_user_id is not null;

create index if not exists clients_user_active_first_run_idx
  on public.clients (user_id, created_at, id)
  where archived_at is null and status <> 'archived';

create index if not exists tasks_user_status_first_run_idx
  on public.tasks (user_id, status, due_at, id)
  where archived_at is null;

create table if not exists public.user_avatars (
  user_id bigint primary key references public.users(id) on delete cascade,
  mime_type text not null,
  image_data bytea not null,
  size_bytes integer not null,
  updated_at timestamptz not null default now()
);

alter table public.user_avatars enable row level security;

-- Supabase Data API remains closed in this architecture: the browser never
-- receives table grants and all product reads/writes go through the Next.js
-- DAL. RLS stays enabled on every personal table as a deny-by-default second
-- boundary; the DAL must still include an explicit owner predicate because the
-- direct PostgreSQL backend role may bypass RLS.
