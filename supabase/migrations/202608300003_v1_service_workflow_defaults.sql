-- Apply service-aware visibility to the standard workflow once. Later changes
-- made by Martu remain untouched because migrations are immutable.

update public.content_workflow_states ws
set is_visible = case
  when ws.slug = 'delivered' then not has_publish.enabled
  when ws.slug in ('scheduled', 'published') then has_publish.enabled
  else ws.is_visible
end
from public.content_workflows w
join public.clients c on c.id = w.client_id
cross join lateral (
  select exists (
    select 1 from public.client_services cs
    join public.services s on s.id = cs.service_id
    where cs.client_id = c.id and cs.is_active and s.slug = 'publishing'
  ) as enabled
) has_publish
where ws.workflow_id = w.id
  and w.is_default
  and ws.slug in ('scheduled', 'published', 'delivered');
