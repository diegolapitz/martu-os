import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getOrCreateChatThread, query } from "@/server/data";
import { closeDatabase } from "@/server/db/client";

import { MartuAgentDataAdapter } from "./data-adapter";

const testDataDir = `.data/vitest-context-thread-${process.pid}-${Date.now()}`;

beforeAll(async () => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
  await query("select 1");
}, 30_000);

afterAll(async () => {
  await closeDatabase();
});

describe("conversation context persistence", () => {
  it("creates a distinct row when the drawer explicitly starts a new conversation", async () => {
    const existing = await getOrCreateChatThread({
      clientSlug: "gavilan",
      title: "Conversación existente",
      source: "web",
    });
    const reused = await getOrCreateChatThread({
      clientSlug: "gavilan",
      title: "Se puede reutilizar",
      source: "web",
    });
    const fresh = await getOrCreateChatThread({
      clientSlug: "gavilan",
      title: "Conversación nueva",
      source: "web",
      createNew: true,
    });

    expect(reused.id).toBe(existing.id);
    expect(fresh.id).not.toBe(existing.id);
  });

  it("does not infer a client from pathname when the pinned scope is global", async () => {
    const thread = await getOrCreateChatThread({
      title: "Contexto global",
      source: "web",
      createNew: true,
    });
    const adapter = new MartuAgentDataAdapter();

    const context = await adapter.buildContext({
      message: "¿Qué tengo hoy?",
      threadId: String(thread.id),
      pathname: "/clients/gavilan/guiones/73",
      contextScope: "global",
      now: new Date("2026-08-30T15:00:00.000Z"),
    });

    expect(context.currentClient).toBeUndefined();
    expect(context.summary).toBe("Vista global de Martu");
  });

  it("keeps the exact entity as the unambiguous turn reference", async () => {
    const rows = await query<{ id: string; title: string }>(`select s.id::text, s.title
      from public.scripts s join public.clients c on c.id = s.client_id
      where c.slug = 'gavilan' order by s.script_number limit 1`);
    const script = rows[0]!;
    const thread = await getOrCreateChatThread({
      clientSlug: "gavilan",
      title: "Contexto de guion",
      source: "web",
      createNew: true,
    });
    const adapter = new MartuAgentDataAdapter();

    const context = await adapter.buildContext({
      message: "Pasalo al viernes.",
      threadId: String(thread.id),
      contextScope: "client",
      contextEntity: {
        id: script.id,
        type: "script",
        title: script.title,
        clientSlug: "gavilan",
      },
      now: new Date("2026-08-30T15:00:00.000Z"),
    });

    expect(context.currentClient?.slug).toBe("gavilan");
    expect(context.lastReferencedEntity).toEqual({
      id: script.id,
      type: "script",
      title: script.title,
      clientSlug: "gavilan",
    });
  });

  it("uses the thread row as the authoritative client scope after navigation", async () => {
    const thread = await getOrCreateChatThread({
      clientSlug: "gavilan",
      title: "Contexto fijado",
      source: "web",
      createNew: true,
    });
    const adapter = new MartuAgentDataAdapter();

    const context = await adapter.buildContext({
      message: "¿Qué hago acá?",
      threadId: String(thread.id),
      clientSlug: "luma-estudio",
      pathname: "/clients/luma-estudio/ideas/88",
      contextScope: "client",
      currentView: {
        pathname: "/clients/luma-estudio/ideas/88",
        clientSlug: "luma-estudio",
        clientName: "Luma Estudio",
        entityType: "idea",
        entityId: "88",
        entityTitle: "Idea de Luma",
      },
      now: new Date("2026-08-30T15:00:00.000Z"),
    });

    expect(context.conversationScope).toBe("client");
    expect(context.conversationClient?.slug).toBe("gavilan");
    expect(context.currentClient?.slug).toBe("gavilan");
    expect(context.currentView?.clientSlug).toBe("luma-estudio");
    expect(context.currentViewItem).toBeUndefined();
  });

  it("loads the exact current idea and restores the pinned entity from thread metadata", async () => {
    const rows = await query<{ id: string; title: string; description: string }>(`select i.id::text, i.title, i.description
      from public.ideas i join public.clients c on c.id = i.client_id
      where c.slug = 'gavilan' order by i.id limit 1`);
    const idea = rows[0]!;
    const thread = await getOrCreateChatThread({
      clientSlug: "gavilan",
      title: "Idea contextual",
      source: "web",
      createNew: true,
    });
    const adapter = new MartuAgentDataAdapter();
    const pinned = { id: idea.id, type: "idea" as const, title: idea.title, clientSlug: "gavilan" };
    const currentView = {
      pathname: `/clients/gavilan/ideas/${idea.id}`,
      section: "ideas",
      clientSlug: "gavilan",
      clientName: "Gavilán",
      entityType: "idea" as const,
      entityId: idea.id,
      entityTitle: idea.title,
    };
    await adapter.appendMessage({
      threadId: String(thread.id),
      role: "user",
      content: "¿Cómo sigo con esto?",
      source: "web",
      clientSlug: "gavilan",
      metadata: {
        conversationScope: "client",
        conversationContext: pinned,
        currentView,
      },
    });

    const context = await adapter.buildContext({
      message: "¿Cómo sigo con esto?",
      threadId: String(thread.id),
      clientSlug: "gavilan",
      contextScope: "client",
      contextEntity: { id: "otro", type: "script", title: "No debe reemplazar la idea", clientSlug: "gavilan" },
      currentView,
      now: new Date("2026-08-30T15:00:00.000Z"),
    });

    expect(context.conversationEntity).toEqual(pinned);
    expect(context.lastReferencedEntity).toEqual(pinned);
    expect(context.currentView).toMatchObject({
      entityType: "idea",
      entityId: idea.id,
      entityTitle: idea.title,
      clientSlug: "gavilan",
    });
    expect(context.currentViewItem).toMatchObject({
      id: idea.id,
      type: "idea",
      title: idea.title,
      body: idea.description,
      clientSlug: "gavilan",
    });
  });
});
