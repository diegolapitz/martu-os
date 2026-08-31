-- Martu OS V2.1 - progressive onboarding and a personal service catalog.
-- Existing service/client/brief/strategy tables remain the source of truth.

alter table public.services
  add column if not exists user_id bigint references public.users(id) on delete cascade,
  add column if not exists icon text not null default 'briefcase-business',
  add column if not exists archived_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- V0 had one global catalog. It belongs to Martu in the current single-user
-- installation; keep the data and make ownership explicit instead of replacing it.
update public.services s
set user_id = owned.user_id
from (
  select cs.service_id, min(c.user_id) as user_id
  from public.client_services cs
  join public.clients c on c.id = cs.client_id
  group by cs.service_id
) owned
where owned.service_id = s.id and s.user_id is null;

update public.services
set user_id = (select id from public.users where slug = 'martu' limit 1)
where user_id is null
  and exists (select 1 from public.users where slug = 'martu');

alter table public.services alter column user_id set not null;
alter table public.services drop constraint if exists services_slug_key;
alter table public.services
  add constraint services_user_slug_unique unique (user_id, slug);
alter table public.services
  add constraint services_icon_not_blank check (btrim(icon) <> '');
alter table public.services
  add constraint services_sort_order_nonnegative check (sort_order >= 0);

update public.services
set icon = case slug
  when 'strategy' then 'compass'
  when 'community-management' then 'messages-square'
  when 'content-creation' then 'clapperboard'
  when 'ideas-planning' then 'lightbulb'
  when 'scripts' then 'scroll-text'
  when 'recording' then 'video'
  when 'editing' then 'scissors'
  when 'publishing' then 'send'
  when 'stories' then 'circle-play'
  when 'metrics-reporting' then 'chart-no-axes-combined'
  when 'meta-ads' then 'megaphone'
  when 'google-ads' then 'badge-dollar-sign'
  when 'meetings-account-management' then 'handshake'
  else icon
end;

insert into public.services
  (user_id, slug, name, short_name, tab_key, sort_order, is_custom, icon)
select u.id, 'google-ads', 'Google Ads', 'Google Ads', 'pauta', 120, false,
  'badge-dollar-sign'
from public.users u
where u.slug = 'martu'
on conflict (user_id, slug) do nothing;

update public.services
set sort_order = 130
where slug = 'meetings-account-management' and sort_order < 130;

create index if not exists services_user_active_order_v2_1_idx
  on public.services (user_id, sort_order, id)
  where archived_at is null;

drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();

create table if not exists public.onboarding_states (
  user_id bigint primary key references public.users(id) on delete cascade,
  status text not null default 'not_started',
  current_step text not null default 'welcome',
  completed_steps text[] not null default '{}',
  skipped_steps text[] not null default '{}',
  profile_text text not null default '',
  confirmed_service_ids bigint[] not null default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_states_status_valid check (
    status in ('not_started', 'in_progress', 'completed', 'skipped')
  ),
  constraint onboarding_states_step_valid check (
    current_step in ('welcome', 'profile', 'services', 'client', 'brief', 'strategy', 'complete')
  )
);

drop trigger if exists onboarding_states_set_updated_at on public.onboarding_states;
create trigger onboarding_states_set_updated_at before update on public.onboarding_states
for each row execute function public.set_updated_at();

alter table public.briefs
  add column if not exists business_description text not null default '',
  add column if not exists competitors text[] not null default '{}',
  add column if not exists desired_outcomes text[] not null default '{}',
  add column if not exists avoidances text[] not null default '{}',
  add column if not exists relevant_links text[] not null default '{}',
  add column if not exists confirmed_at timestamptz;

alter table public.strategies
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_url text,
  add column if not exists source_text text not null default '',
  add column if not exists confirmed_at timestamptz;

alter table public.onboarding_states enable row level security;

