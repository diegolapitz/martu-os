import {
  query,
  transaction,
  type DatabaseRow,
  type DbExecutor,
} from "@/server/db";
import { requireAppUserId } from "@/server/auth";

import { id, iso, jsonObject, number } from "./serialize";
import type {
  InsightItem,
  InsightKind,
  InsightSurface,
} from "./types";

type Row = DatabaseRow;
type Executor = Pick<DbExecutor, "query">;

export interface InsightWriteInput {
  kind: InsightKind;
  statement: string;
  evidence?: Record<string, unknown>;
  confidence?: number | null;
  contentItemId?: string | null;
  publicationId?: string | null;
  campaignId?: string | null;
  creativeId?: string | null;
}

const INSIGHT_SELECT = `
  select i.*, c.slug as client_slug,
    direct_content.title as direct_content_title,
    publication.platform as publication_platform,
    publication.content_item_id as publication_content_item_id,
    publication_content.title as publication_content_title,
    campaign.name as campaign_name,
    creative.name as creative_name,
    creative.campaign_id as creative_campaign_id,
    creative.content_item_id as creative_content_item_id,
    creative_content.title as creative_content_title
  from public.insights i
  join public.clients c on c.id = i.client_id
  join public.users u on u.id = c.user_id
  left join public.content_items direct_content on direct_content.id = i.content_item_id
  left join public.publications publication on publication.id = i.publication_id
  left join public.content_items publication_content on publication_content.id = publication.content_item_id
  left join public.ad_campaigns campaign on campaign.id = i.campaign_id
  left join public.ad_creatives creative on creative.id = i.creative_id
  left join public.content_items creative_content on creative_content.id = creative.content_item_id`;

function insightSurface(row: Row): InsightSurface {
  const evidence = jsonObject(row.evidence);
  return row.campaign_id != null ||
    row.creative_id != null ||
    evidence.surface === "ads"
    ? "ads"
    : "metrics";
}

export function mapInsightRow(row: Row): InsightItem {
  const clientSlug = String(row.client_slug);
  const creativeCampaignId = row.creative_campaign_id
    ? id(row.creative_campaign_id)
    : null;
  const campaignId = row.campaign_id ? id(row.campaign_id) : creativeCampaignId;
  const contentItemId = row.content_item_id
    ? id(row.content_item_id)
    : row.publication_content_item_id
      ? id(row.publication_content_item_id)
      : row.creative_content_item_id
        ? id(row.creative_content_item_id)
        : null;
  const contentTitle = row.direct_content_title
    ? String(row.direct_content_title)
    : row.publication_content_title
      ? String(row.publication_content_title)
      : row.creative_content_title
        ? String(row.creative_content_title)
        : null;
  const creativeId = row.creative_id ? id(row.creative_id) : null;
  const publicationId = row.publication_id ? id(row.publication_id) : null;

  let targetPath: string | null = null;
  let targetLabel: string | null = null;
  if (creativeId && campaignId) {
    targetPath = `/clients/${encodeURIComponent(clientSlug)}/pauta/${encodeURIComponent(campaignId)}#creative-${encodeURIComponent(creativeId)}`;
    targetLabel = row.creative_name ? String(row.creative_name) : "Ver creativo";
  } else if (campaignId) {
    targetPath = `/clients/${encodeURIComponent(clientSlug)}/pauta/${encodeURIComponent(campaignId)}`;
    targetLabel = row.campaign_name ? String(row.campaign_name) : "Ver campaña";
  } else if (contentItemId) {
    targetPath = `/clients/${encodeURIComponent(clientSlug)}/contenido/${encodeURIComponent(contentItemId)}`;
    targetLabel = contentTitle ?? "Ver contenido";
  }

  return {
    id: id(row.id),
    kind: String(row.kind) as InsightKind,
    statement: String(row.statement),
    evidence: jsonObject(row.evidence),
    confidence:
      row.confidence == null ? null : number(row.confidence),
    source: String(row.source),
    surface: insightSurface(row),
    contentItemId,
    contentTitle,
    publicationId,
    publicationLabel: publicationId
      ? row.publication_platform
        ? `Publicación en ${String(row.publication_platform)}`
        : "Publicación"
      : null,
    campaignId,
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    creativeId,
    creativeName: row.creative_name ? String(row.creative_name) : null,
    targetPath,
    targetLabel,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

async function ownedClient(executor: Executor, slug: string): Promise<Row> {
  const userId = await requireAppUserId(executor);
  const rows = await executor.query<Row>(
    `select c.* from public.clients c
    join public.users u on u.id = c.user_id
    where u.id = $2 and c.slug = $1 and c.archived_at is null
    limit 1`,
    [slug, userId],
  );
  if (!rows[0]) throw new Error("No encontré ese cliente.");
  return rows[0];
}

async function ownedInsight(executor: Executor, insightId: string): Promise<Row> {
  const userId = await requireAppUserId(executor);
  const rows = await executor.query<Row>(
    `${INSIGHT_SELECT}
    where u.id = $2 and i.id = $1
    limit 1`,
    [insightId, userId],
  );
  if (!rows[0]) throw new Error("No encontré ese insight.");
  return rows[0];
}

async function assertReference(
  executor: Executor,
  sql: string,
  clientId: string,
  referenceId: string | null | undefined,
  label: string,
) {
  if (referenceId == null) return;
  const rows = await executor.query<Row>(sql, [referenceId, clientId]);
  if (!rows[0]) throw new Error(`${label} pertenece a otro cliente o no existe.`);
}

async function validateReferences(
  executor: Executor,
  clientId: string,
  input: Pick<
    InsightWriteInput,
    "contentItemId" | "publicationId" | "campaignId" | "creativeId"
  >,
) {
  await assertReference(
    executor,
    `select id from public.content_items
    where id = $1 and client_id = $2 and archived_at is null`,
    clientId,
    input.contentItemId,
    "El contenido",
  );
  await assertReference(
    executor,
    `select p.id from public.publications p
    join public.content_items ci on ci.id = p.content_item_id
    where p.id = $1 and ci.client_id = $2`,
    clientId,
    input.publicationId,
    "La publicación",
  );
  await assertReference(
    executor,
    `select id from public.ad_campaigns
    where id = $1 and client_id = $2`,
    clientId,
    input.campaignId,
    "La campaña",
  );
  await assertReference(
    executor,
    `select creative.id from public.ad_creatives creative
    join public.ad_campaigns campaign on campaign.id = creative.campaign_id
    where creative.id = $1 and campaign.client_id = $2`,
    clientId,
    input.creativeId,
    "El creativo",
  );

  if (input.publicationId && input.contentItemId) {
    const relation = await executor.query<Row>(
      `select id from public.publications
      where id = $1 and content_item_id = $2`,
      [input.publicationId, input.contentItemId],
    );
    if (!relation[0]) {
      throw new Error("La publicación no pertenece al contenido indicado.");
    }
  }
  if (input.creativeId && input.campaignId) {
    const relation = await executor.query<Row>(
      `select id from public.ad_creatives
      where id = $1 and campaign_id = $2`,
      [input.creativeId, input.campaignId],
    );
    if (!relation[0]) {
      throw new Error("El creativo no pertenece a la campaña indicada.");
    }
  }
}

async function hydratedInsight(
  executor: Executor,
  insightId: string,
): Promise<InsightItem> {
  return mapInsightRow(await ownedInsight(executor, insightId));
}

export async function listInsightsV1(input: {
  clientSlug: string;
  surface?: InsightSurface;
  includeArchived?: boolean;
  limit?: number;
}): Promise<InsightItem[]> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 200);
  const userId = await requireAppUserId();
  const rows = await query<Row>(
    `${INSIGHT_SELECT}
    where u.id = $5 and c.slug = $1
      and ($2::boolean or i.archived_at is null)
      and (
        $3::text is null
        or ($3 = 'ads' and (
          i.campaign_id is not null or i.creative_id is not null
          or i.evidence->>'surface' = 'ads'
        ))
        or ($3 = 'metrics' and (
          i.campaign_id is null and i.creative_id is null
          and coalesce(i.evidence->>'surface', 'metrics') <> 'ads'
        ))
      )
    order by
      case i.kind
        when 'observation' then 1
        when 'pattern' then 2
        when 'hypothesis' then 3
        when 'recommendation' then 4
        else 5
      end,
      i.created_at desc
    limit $4`,
    [input.clientSlug, Boolean(input.includeArchived), input.surface ?? null, limit, userId],
  );
  return rows.map(mapInsightRow);
}

export async function createInsightV1(
  input: InsightWriteInput & { clientSlug: string },
): Promise<InsightItem> {
  return transaction(async (tx) => {
    const client = await ownedClient(tx, input.clientSlug);
    const clientId = id(client.id);
    await validateReferences(tx, clientId, input);
    const rows = await tx.query<Row>(
      `insert into public.insights
      (user_id,client_id,kind,statement,evidence,confidence,
       content_item_id,publication_id,campaign_id,creative_id,source)
      values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,'manual')
      returning id`,
      [
        client.user_id,
        clientId,
        input.kind,
        input.statement.trim(),
        JSON.stringify(input.evidence ?? {}),
        input.confidence ?? null,
        input.contentItemId ?? null,
        input.publicationId ?? null,
        input.campaignId ?? null,
        input.creativeId ?? null,
      ],
    );
    return hydratedInsight(tx, id(rows[0]!.id));
  });
}

export async function updateInsightV1(
  insightId: string,
  input: Partial<InsightWriteInput>,
): Promise<InsightItem> {
  return transaction(async (tx) => {
    const current = await ownedInsight(tx, insightId);
    const merged: InsightWriteInput = {
      kind: input.kind ?? (String(current.kind) as InsightKind),
      statement: input.statement ?? String(current.statement),
      evidence: input.evidence ?? jsonObject(current.evidence),
      confidence:
        input.confidence !== undefined
          ? input.confidence
          : current.confidence == null
            ? null
            : number(current.confidence),
      contentItemId:
        input.contentItemId !== undefined
          ? input.contentItemId
          : current.content_item_id
            ? id(current.content_item_id)
            : null,
      publicationId:
        input.publicationId !== undefined
          ? input.publicationId
          : current.publication_id
            ? id(current.publication_id)
            : null,
      campaignId:
        input.campaignId !== undefined
          ? input.campaignId
          : current.campaign_id
            ? id(current.campaign_id)
            : null,
      creativeId:
        input.creativeId !== undefined
          ? input.creativeId
          : current.creative_id
            ? id(current.creative_id)
            : null,
    };
    await validateReferences(tx, id(current.client_id), merged);
    await tx.query(
      `update public.insights set
        kind = $2,
        statement = $3,
        evidence = $4::jsonb,
        confidence = $5,
        content_item_id = $6,
        publication_id = $7,
        campaign_id = $8,
        creative_id = $9,
        source = 'manual'
      where id = $1`,
      [
        insightId,
        merged.kind,
        merged.statement.trim(),
        JSON.stringify(merged.evidence ?? {}),
        merged.confidence ?? null,
        merged.contentItemId ?? null,
        merged.publicationId ?? null,
        merged.campaignId ?? null,
        merged.creativeId ?? null,
      ],
    );
    return hydratedInsight(tx, insightId);
  });
}

export async function archiveInsightV1(insightId: string): Promise<void> {
  return transaction(async (tx) => {
    await ownedInsight(tx, insightId);
    await tx.query(
      "update public.insights set archived_at = now() where id = $1",
      [insightId],
    );
  });
}
