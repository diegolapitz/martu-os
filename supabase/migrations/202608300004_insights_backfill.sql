-- Baseline readings for databases that already contain demo/imported metrics.
-- Every statement is descriptive or explicitly testable; none asserts causality.

with ranked_content as (
  select
    c.user_id,
    c.id as client_id,
    ci.id as content_item_id,
    cm.publication_id,
    ci.title,
    cm.views,
    cm.reach,
    cm.retention_rate,
    cm.saves,
    cm.shares,
    cm.captured_at,
    row_number() over (
      partition by c.id
      order by cm.views desc, cm.captured_at desc, cm.id desc
    ) as position
  from public.clients c
  join public.content_items ci on ci.client_id = c.id
  join public.content_metrics cm on cm.content_item_id = ci.id
  where c.archived_at is null and ci.archived_at is null
)
insert into public.insights (
  user_id, client_id, kind, statement, evidence, confidence,
  content_item_id, publication_id, source
)
select
  ranked.user_id,
  ranked.client_id,
  'observation',
  ranked.title || ' registra la mayor cantidad de views del corte disponible (' ||
    ranked.views::text || '). Esta comparación describe el corte y no explica la causa.',
  jsonb_strip_nulls(jsonb_build_object(
    'surface', 'metrics',
    'views', ranked.views,
    'reach', ranked.reach,
    'retention', case
      when ranked.retention_rate is null then null
      else round(ranked.retention_rate * 100, 1)
    end,
    'saves', ranked.saves,
    'shares', ranked.shares,
    'capturedAt', ranked.captured_at
  )),
  0.950,
  ranked.content_item_id,
  ranked.publication_id,
  'derived-v1-metrics-top'
from ranked_content ranked
where ranked.position = 1
  and not exists (
    select 1 from public.insights existing
    where existing.client_id = ranked.client_id
      and existing.source = 'derived-v1-metrics-top'
      and existing.archived_at is null
  );

with metric_base as (
  select
    c.user_id,
    c.id as client_id,
    cm.retention_rate,
    cm.saves,
    avg(cm.retention_rate) over (partition by c.id) as retention_average
  from public.clients c
  join public.content_items ci on ci.client_id = c.id
  join public.content_metrics cm on cm.content_item_id = ci.id
  where c.archived_at is null
    and ci.archived_at is null
    and cm.retention_rate is not null
), metric_groups as (
  select
    user_id,
    client_id,
    count(*) as sample_size,
    count(*) filter (where retention_rate >= retention_average) as high_count,
    count(*) filter (where retention_rate < retention_average) as low_count,
    round(avg(saves) filter (where retention_rate >= retention_average), 1) as high_saves,
    round(avg(saves) filter (where retention_rate < retention_average), 1) as low_saves,
    round(avg(retention_rate) * 100, 1) as retention_average_percent
  from metric_base
  group by user_id, client_id
)
insert into public.insights (
  user_id, client_id, kind, statement, evidence, confidence, source
)
select
  grouped.user_id,
  grouped.client_id,
  'pattern',
  'En este corte, el grupo de piezas con retención igual o superior al promedio registra ' ||
    grouped.high_saves::text || ' guardados en promedio frente a ' ||
    grouped.low_saves::text || ' del resto. Es una asociación descriptiva, no causalidad.',
  jsonb_build_object(
    'surface', 'metrics',
    'sampleSize', grouped.sample_size,
    'retentionAverage', grouped.retention_average_percent,
    'highRetentionGroupSize', grouped.high_count,
    'lowRetentionGroupSize', grouped.low_count,
    'highRetentionAverageSaves', grouped.high_saves,
    'lowRetentionAverageSaves', grouped.low_saves
  ),
  0.650,
  'derived-v1-metrics-pattern'
from metric_groups grouped
where grouped.sample_size >= 4
  and grouped.high_count >= 2
  and grouped.low_count >= 2
  and grouped.high_saves is distinct from grouped.low_saves
  and not exists (
    select 1 from public.insights existing
    where existing.client_id = grouped.client_id
      and existing.source = 'derived-v1-metrics-pattern'
      and existing.archived_at is null
  );

insert into public.insights (
  user_id, client_id, kind, statement, evidence, confidence, source
)
select
  pattern.user_id,
  pattern.client_id,
  'hypothesis',
  'La diferencia de guardados podría estar asociada con la retención, pero este corte no aísla formato, tema ni distribución. Hace falta una prueba controlada antes de atribuir una causa.',
  jsonb_build_object(
    'surface', 'metrics',
    'summary', 'Hipótesis basada en la asociación descriptiva del corte; quedan variables sin controlar.',
    'sourceInsightId', pattern.id
  ),
  0.400,
  'derived-v1-metrics-hypothesis'
from public.insights pattern
where pattern.kind = 'pattern'
  and pattern.source = 'derived-v1-metrics-pattern'
  and pattern.archived_at is null
  and not exists (
    select 1 from public.insights existing
    where existing.client_id = pattern.client_id
      and existing.source = 'derived-v1-metrics-hypothesis'
      and existing.archived_at is null
  );

with ranked_content as (
  select
    c.user_id,
    c.id as client_id,
    ci.id as content_item_id,
    cm.publication_id,
    ci.title,
    cm.views,
    cm.retention_rate,
    cm.saves,
    cm.captured_at,
    row_number() over (
      partition by c.id
      order by cm.views desc, cm.captured_at desc, cm.id desc
    ) as position
  from public.clients c
  join public.content_items ci on ci.client_id = c.id
  join public.content_metrics cm on cm.content_item_id = ci.id
  where c.archived_at is null and ci.archived_at is null
)
insert into public.insights (
  user_id, client_id, kind, statement, evidence, confidence,
  content_item_id, publication_id, source
)
select
  ranked.user_id,
  ranked.client_id,
  'recommendation',
  'Usar ' || ranked.title ||
    ' como referencia para una variante que cambie una sola variable y comparar ambas piezas en una ventana equivalente.',
  jsonb_strip_nulls(jsonb_build_object(
    'surface', 'metrics',
    'summary', 'Siguiente paso diseñado para producir evidencia comparable.',
    'referenceViews', ranked.views,
    'referenceRetention', case
      when ranked.retention_rate is null then null
      else round(ranked.retention_rate * 100, 1)
    end,
    'referenceSaves', ranked.saves
  )),
  0.550,
  ranked.content_item_id,
  ranked.publication_id,
  'derived-v1-metrics-experiment'
from ranked_content ranked
where ranked.position = 1
  and not exists (
    select 1 from public.insights existing
    where existing.client_id = ranked.client_id
      and existing.source = 'derived-v1-metrics-experiment'
      and existing.archived_at is null
  );

with ranked_campaigns as (
  select
    c.user_id,
    campaign.client_id,
    campaign.id as campaign_id,
    campaign.name,
    campaign.spend,
    campaign.impressions,
    campaign.clicks,
    campaign.ctr,
    campaign.cpc,
    campaign.cpa,
    campaign.roas,
    row_number() over (
      partition by campaign.client_id
      order by campaign.roas desc nulls last, campaign.updated_at desc, campaign.id desc
    ) as position
  from public.ad_campaigns campaign
  join public.clients c on c.id = campaign.client_id
  where c.archived_at is null
)
insert into public.insights (
  user_id, client_id, kind, statement, evidence, confidence,
  campaign_id, source
)
select
  ranked.user_id,
  ranked.client_id,
  'observation',
  ranked.name || ' tiene el ROAS más alto del corte disponible (' ||
    coalesce(ranked.roas::text, 'sin dato') ||
    'x). La comparación no demuestra qué variable produjo la diferencia.',
  jsonb_strip_nulls(jsonb_build_object(
    'surface', 'ads',
    'spend', ranked.spend,
    'impressions', ranked.impressions,
    'clicks', ranked.clicks,
    'ctr', ranked.ctr,
    'cpc', ranked.cpc,
    'cpa', ranked.cpa,
    'roas', ranked.roas
  )),
  0.950,
  ranked.campaign_id,
  'derived-v1-ads-top'
from ranked_campaigns ranked
where ranked.position = 1
  and not exists (
    select 1 from public.insights existing
    where existing.client_id = ranked.client_id
      and existing.source = 'derived-v1-ads-top'
      and existing.archived_at is null
  );

with ranked_campaigns as (
  select
    c.user_id,
    campaign.client_id,
    campaign.id as campaign_id,
    campaign.name,
    campaign.ctr,
    campaign.cpa,
    campaign.roas,
    row_number() over (
      partition by campaign.client_id
      order by campaign.roas desc nulls last, campaign.updated_at desc, campaign.id desc
    ) as position
  from public.ad_campaigns campaign
  join public.clients c on c.id = campaign.client_id
  where c.archived_at is null
)
insert into public.insights (
  user_id, client_id, kind, statement, evidence, confidence,
  campaign_id, source
)
select
  ranked.user_id,
  ranked.client_id,
  'recommendation',
  'Antes de mover presupuesto hacia ' || ranked.name ||
    ', compararla con otra campaña del mismo objetivo y ventana. Si se escala, hacerlo por etapas y revisar CTR, CPA y ROAS juntos.',
  jsonb_strip_nulls(jsonb_build_object(
    'surface', 'ads',
    'summary', 'Próximo paso conservador basado en una comparación incompleta.',
    'referenceCtr', ranked.ctr,
    'referenceCpa', ranked.cpa,
    'referenceRoas', ranked.roas
  )),
  0.550,
  ranked.campaign_id,
  'derived-v1-ads-budget-test'
from ranked_campaigns ranked
where ranked.position = 1
  and not exists (
    select 1 from public.insights existing
    where existing.client_id = ranked.client_id
      and existing.source = 'derived-v1-ads-budget-test'
      and existing.archived_at is null
  );
