import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import {
  archiveInsightV1,
  createInsightV1,
  listInsightsV1,
  updateInsightV1,
} from "./insights";
import { getClientWorkspace } from "./queries";
import { query } from "@/server/db";

const testDataDir = `.data/vitest-insights-${process.pid}-${Date.now()}`;

beforeAll(async () => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;

  // A new local database migrates before it is seeded. Replaying only the
  // idempotent backfill here simulates the production rollout over existing data.
  await getClientWorkspace("gavilan", { tab: "metricas" });
  await query(
    "delete from public.schema_migrations where version = $1",
    ["202608300004_insights_backfill.sql"],
  );
  await runMigrations();
}, 30_000);

afterAll(async () => {
  await closeDatabase();
});

describe("persistent performance insights", () => {
  it("backfills cautious categorized readings with evidence and deep links", async () => {
    const metrics = await listInsightsV1({
      clientSlug: "gavilan",
      surface: "metrics",
    });
    expect(metrics.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "observation",
        "pattern",
        "hypothesis",
        "recommendation",
      ]),
    );
    expect(metrics.every((item) => item.surface === "metrics")).toBe(true);
    expect(metrics.find((item) => item.kind === "hypothesis")?.statement).toMatch(
      /hace falta|podr[ií]a/i,
    );
    expect(metrics.find((item) => item.contentItemId)?.targetPath).toMatch(
      /^\/clients\/gavilan\/contenido\/\d+$/,
    );

    const ads = await listInsightsV1({
      clientSlug: "gavilan",
      surface: "ads",
    });
    expect(ads.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["observation", "recommendation"]),
    );
    expect(ads.find((item) => item.campaignId)?.targetPath).toMatch(
      /^\/clients\/gavilan\/pauta\/\d+$/,
    );
  });

  it("creates, edits, persists and archives a manually linked insight", async () => {
    const workspace = await getClientWorkspace("gavilan", { tab: "metricas" });
    const metric = workspace.metrics.find((item) => item.contentItemId)!;
    const created = await createInsightV1({
      clientSlug: "gavilan",
      kind: "observation",
      statement: "El corte manual registra 120 guardados.",
      evidence: { surface: "metrics", saves: 120, sampleSize: 1 },
      confidence: 0.9,
      contentItemId: metric.contentItemId,
    });

    expect(created).toMatchObject({
      kind: "observation",
      source: "manual",
      confidence: 0.9,
      contentItemId: metric.contentItemId,
      surface: "metrics",
    });
    expect(created.targetPath).toBe(
      `/clients/gavilan/contenido/${metric.contentItemId}`,
    );

    const updated = await updateInsightV1(created.id, {
      kind: "hypothesis",
      statement:
        "Los guardados podrían estar asociados con el enfoque, pero falta una comparación controlada.",
      confidence: 0.45,
    });
    expect(updated).toMatchObject({
      kind: "hypothesis",
      confidence: 0.45,
      source: "manual",
    });

    await closeDatabase();
    const reopened = await listInsightsV1({
      clientSlug: "gavilan",
      surface: "metrics",
    });
    expect(reopened.find((item) => item.id === created.id)?.statement).toBe(
      updated.statement,
    );

    await archiveInsightV1(created.id);
    expect(
      (await listInsightsV1({ clientSlug: "gavilan" })).some(
        (item) => item.id === created.id,
      ),
    ).toBe(false);
    expect(
      (
        await listInsightsV1({
          clientSlug: "gavilan",
          includeArchived: true,
        })
      ).some((item) => item.id === created.id),
    ).toBe(true);
  });

  it("rejects evidence links that belong to another client", async () => {
    const gavilan = await getClientWorkspace("gavilan", { tab: "metricas" });
    const foreignContentId = gavilan.metrics.find(
      (item) => item.contentItemId,
    )!.contentItemId!;

    await expect(
      createInsightV1({
        clientSlug: "nido",
        kind: "observation",
        statement: "Lectura con vínculo inválido.",
        evidence: { surface: "metrics" },
        contentItemId: foreignContentId,
      }),
    ).rejects.toThrow(/otro cliente/i);
  });

  it("keeps unlinked ad readings on the ads surface", async () => {
    const created = await createInsightV1({
      clientSlug: "gavilan",
      kind: "recommendation",
      statement: "Comparar una ventana equivalente antes de mover presupuesto.",
      evidence: { surface: "ads", summary: "Recomendación manual sin vínculo." },
      confidence: 0.5,
    });
    const ads = await listInsightsV1({
      clientSlug: "gavilan",
      surface: "ads",
    });
    expect(ads.some((item) => item.id === created.id)).toBe(true);
    expect(created.surface).toBe("ads");
  });
});
