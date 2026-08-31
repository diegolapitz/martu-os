alter table public.communication_profiles
  add column if not exists morning_briefing_enabled boolean not null default true,
  add column if not exists midday_check_enabled boolean not null default true,
  add column if not exists end_of_day_enabled boolean not null default false;

