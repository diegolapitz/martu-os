import "server-only";

import {
  query,
  transaction,
  type DatabaseRow,
  type DbExecutor,
} from "@/server/db";

type Row = DatabaseRow;
type Executor = Pick<DbExecutor, "query">;

export type ManagedMemoryScope = "global" | "client";

export type ManagedMemory = {
  id: string;
  clientId: string | null;
  clientSlug: string | null;
  clientName: string | null;
  scope: ManagedMemoryScope;
  category: string;
  fact: string;
  importance: number;
  source: string;
  memoryKind: string;
  lifecycleStatus: string;
  confidence: number;
  supersedesId: string | null;
  lastUsedAt: string | null;
  forgottenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryDraft = {
  scope: ManagedMemoryScope;
  clientSlug?: string | null;
  category: string;
  fact: string;
  importance?: number;
  memoryKind?: string;
};

export async function listManagedMemories(
  options: {
    scope?: "all" | ManagedMemoryScope;
    clientSlug?: string;
    includeGlobal?: boolean;
    limit?: number;
  } = {},
): Promise<ManagedMemory[]> {
  const rows = await query<Row>(
    `select m.*, c.slug as client_slug, c.name as client_name
    from public.memories m
    join public.users u on u.id = m.user_id
    left join public.clients c on c.id = m.client_id
    where u.slug = 'martu' and m.lifecycle_status = 'active'
      and (m.client_id is null or c.archived_at is null)
      and ($1::text = 'all' or m.scope = $1)
      and (
        $2::text is null
        or c.slug = $2
        or ($3::boolean and m.scope = 'global')
      )
    order by m.importance desc, m.updated_at desc
    limit $4`,
    [
      options.scope ?? "all",
      options.clientSlug ?? null,
      options.includeGlobal ?? false,
      Math.min(200, Math.max(1, options.limit ?? 100)),
    ],
  );
  return rows.map(memoryDto);
}

export async function createManagedMemory(
  input: MemoryDraft,
): Promise<ManagedMemory> {
  return transaction(async (tx) => {
    const userId = await martuUserId(tx);
    const client = await resolveClient(tx, input.scope, input.clientSlug);
    const fact = input.fact.trim();
    const category = input.category.trim();
    const memoryKind = input.memoryKind?.trim() || "fact";
    const importance = clampImportance(input.importance);
    const fingerprint = memoryFingerprint(fact);

    const existing = await tx.query<Row>(
      `select m.*, c.slug as client_slug, c.name as client_name
      from public.memories m
      left join public.clients c on c.id = m.client_id
      where m.user_id = $1 and m.client_id is not distinct from $2
        and m.memory_kind = $3 and m.fingerprint = $4
        and m.lifecycle_status = 'active'
      limit 1`,
      [userId, client?.id ?? null, memoryKind, fingerprint],
    );
    if (existing[0]) {
      const rows = await tx.query<Row>(
        `update public.memories set
          category = $2,
          importance = greatest(importance,$3),
          last_used_at = now()
        where id = $1 returning *`,
        [existing[0].id, category, importance],
      );
      return memoryDto({
        ...rows[0]!,
        client_slug: existing[0].client_slug,
        client_name: existing[0].client_name,
      });
    }

    const rows = await tx.query<Row>(
      `insert into public.memories
      (user_id,client_id,scope,category,fact,importance,source,memory_kind,
       lifecycle_status,fingerprint,confidence)
      values ($1,$2,$3,$4,$5,$6,'manual',$7,'active',$8,1)
      returning *`,
      [
        userId,
        client?.id ?? null,
        input.scope,
        category,
        fact,
        importance,
        memoryKind,
        fingerprint,
      ],
    );
    return memoryDto({
      ...rows[0]!,
      client_slug: client?.slug ?? null,
      client_name: client?.name ?? null,
    });
  });
}

export async function correctManagedMemory(
  id: string,
  input: Partial<MemoryDraft>,
): Promise<ManagedMemory> {
  return transaction(async (tx) => {
    const current = await ownedMemory(tx, id);
    const scope = input.scope ?? (String(current.scope) as ManagedMemoryScope);
    const currentClientSlug = nullableString(current.client_slug);
    const client = await resolveClient(
      tx,
      scope,
      input.clientSlug === undefined ? currentClientSlug : input.clientSlug,
    );
    const fact = (input.fact ?? String(current.fact)).trim();
    const category = (input.category ?? String(current.category)).trim();
    const memoryKind = (
      input.memoryKind ?? String(current.memory_kind ?? "fact")
    ).trim();
    const importance = clampImportance(
      input.importance ?? Number(current.importance),
    );

    const rows = await tx.query<Row>(
      `insert into public.memories
      (user_id,client_id,scope,category,fact,importance,source,memory_kind,
       lifecycle_status,fingerprint,confidence,supersedes_id)
      values ($1,$2,$3,$4,$5,$6,'manual_correction',$7,'active',$8,$9,$10)
      returning *`,
      [
        current.user_id,
        client?.id ?? null,
        scope,
        category,
        fact,
        importance,
        memoryKind,
        memoryFingerprint(fact),
        Number(current.confidence ?? 1),
        current.id,
      ],
    );
    await tx.query(
      `update public.memories
      set lifecycle_status = 'superseded'
      where id = $1 and lifecycle_status = 'active'`,
      [current.id],
    );
    return memoryDto({
      ...rows[0]!,
      client_slug: client?.slug ?? null,
      client_name: client?.name ?? null,
    });
  });
}

export async function archiveManagedMemory(
  id: string,
  mode: "archive" | "forget" = "forget",
): Promise<ManagedMemory> {
  return transaction(async (tx) => {
    const current = await ownedMemory(tx, id);
    const rows = await tx.query<Row>(
      `update public.memories set
        lifecycle_status = $2,
        forgotten_at = case when $2 = 'forgotten' then now() else forgotten_at end
      where id = $1 and lifecycle_status = 'active'
      returning *`,
      [current.id, mode === "forget" ? "forgotten" : "archived"],
    );
    if (!rows[0]) throw new Error("Esa memoria ya no está activa.");
    return memoryDto({
      ...rows[0],
      client_slug: current.client_slug,
      client_name: current.client_name,
    });
  });
}

async function martuUserId(executor: Executor): Promise<string> {
  const rows = await executor.query<Row>(
    "select id from public.users where slug = 'martu' limit 1",
  );
  if (!rows[0]) throw new Error("La usuaria Martu no está inicializada.");
  return String(rows[0].id);
}

async function resolveClient(
  executor: Executor,
  scope: ManagedMemoryScope,
  clientSlug?: string | null,
): Promise<Row | undefined> {
  if (scope === "global") return undefined;
  if (!clientSlug)
    throw new Error("La memoria de cliente necesita un cliente.");
  const rows = await executor.query<Row>(
    `select c.id, c.slug, c.name from public.clients c
    join public.users u on u.id = c.user_id
    where u.slug = 'martu' and c.slug = $1 and c.archived_at is null
    limit 1`,
    [clientSlug],
  );
  if (!rows[0]) throw new Error("No encontré ese cliente.");
  return rows[0];
}

async function ownedMemory(executor: Executor, id: string): Promise<Row> {
  const rows = await executor.query<Row>(
    `select m.*, c.slug as client_slug, c.name as client_name
    from public.memories m
    join public.users u on u.id = m.user_id
    left join public.clients c on c.id = m.client_id
    where u.slug = 'martu' and m.id = $1
    limit 1 for update of m`,
    [id],
  );
  if (!rows[0]) throw new Error("No encontré esa memoria.");
  if (String(rows[0].lifecycle_status) !== "active") {
    throw new Error("Esa memoria ya no está activa.");
  }
  return rows[0];
}

function memoryDto(row: Row): ManagedMemory {
  return {
    id: String(row.id),
    clientId: nullableString(row.client_id),
    clientSlug: nullableString(row.client_slug),
    clientName: nullableString(row.client_name),
    scope: String(row.scope) as ManagedMemoryScope,
    category: String(row.category),
    fact: String(row.fact),
    importance: Number(row.importance),
    source: String(row.source),
    memoryKind: String(row.memory_kind ?? "fact"),
    lifecycleStatus: String(row.lifecycle_status ?? "active"),
    confidence: Number(row.confidence ?? 1),
    supersedesId: nullableString(row.supersedes_id),
    lastUsedAt: iso(row.last_used_at),
    forgottenAt: iso(row.forgotten_at),
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function memoryFingerprint(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ");
}

function clampImportance(value?: number): number {
  return Math.max(1, Math.min(5, Math.round(value ?? 3)));
}

function nullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}
