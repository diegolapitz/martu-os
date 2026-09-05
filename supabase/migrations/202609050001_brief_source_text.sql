-- Preserve original long-form brief imports separately from the concise brief fields.
alter table public.briefs
  add column if not exists source_text text not null default '';
