-- V1 integrity/backfill. This migration intentionally mirrors the bootstrap
-- performed by the demo seed: existing installations are repaired here,
-- pristine installations are provisioned after the seed creates clients.

insert into public.content_workflows (client_id, name, slug, is_default)
select c.id, 'Flujo principal', 'principal', true
from public.clients c
where not exists (
  select 1 from public.content_workflows current_workflow
  where current_workflow.client_id = c.id and current_workflow.is_default
)
on conflict (client_id, slug) do nothing;

insert into public.content_workflow_states
  (workflow_id, slug, label, color, position, is_visible, terminal_kind)
select w.id, seed.slug, seed.label, seed.color, seed.position,
  case
    when seed.slug = 'delivered' then not has_publish.enabled
    when seed.slug in ('scheduled', 'published') then has_publish.enabled
    else true
  end,
  seed.terminal_kind
from public.content_workflows w
join public.clients c on c.id = w.client_id
cross join (values
  ('idea', 'Idea', '#94a3b8', 10, null),
  ('script', 'Guion', '#8b5cf6', 20, null),
  ('to_record', 'Para grabar', '#f59e0b', 30, null),
  ('recorded', 'Grabado', '#f97316', 40, null),
  ('editing', 'Editando', '#0ea5e9', 50, null),
  ('ready', 'Listo', '#14b8a6', 60, null),
  ('approval', 'En aprobación', '#eab308', 70, null),
  ('approved', 'Aprobado', '#22c55e', 80, null),
  ('scheduled', 'Programado', '#3b82f6', 90, null),
  ('published', 'Publicado', '#16a34a', 100, 'published'),
  ('delivered', 'Entregado', '#475569', 110, 'delivered')
) as seed(slug, label, color, position, terminal_kind)
cross join lateral (
  select exists (
    select 1 from public.client_services cs
    join public.services s on s.id = cs.service_id
    where cs.client_id = c.id and cs.is_active and s.slug = 'publishing'
  ) as enabled
) has_publish
where w.is_default
on conflict (workflow_id, slug) do nothing;

update public.content_items ci
set workflow_id = w.id,
    workflow_state_id = ws.id
from public.content_workflows w
join public.content_workflow_states ws on ws.workflow_id = w.id
where w.client_id = ci.client_id
  and w.is_default
  and ws.slug = ci.status
  and (ci.workflow_id is null or ci.workflow_state_id is null);

insert into public.script_counters (client_id, next_number)
select c.id, coalesce(max(s.script_number), 0) + 1
from public.clients c
left join public.scripts s on s.client_id = c.id
group by c.id
on conflict (client_id) do update
set next_number = greatest(public.script_counters.next_number, excluded.next_number);

update public.ai_nudges
set lifecycle_state = case
      when status = 'dismissed' then 'dismissed'
      when status in ('acted', 'expired') then 'resolved'
      else lifecycle_state
    end,
    resolved_at = case
      when status in ('acted', 'expired') then coalesce(resolved_at, updated_at)
      else resolved_at
    end,
    dismissed_at = case
      when status = 'dismissed' then coalesce(dismissed_at, updated_at)
      else dismissed_at
    end,
    resolution_reason = case
      when status = 'dismissed' then coalesce(resolution_reason, 'historical_dismissal')
      when status = 'acted' then coalesce(resolution_reason, 'historical_action')
      when status = 'expired' then coalesce(resolution_reason, 'historical_expiration')
      else resolution_reason
    end
where status in ('dismissed', 'acted', 'expired');
