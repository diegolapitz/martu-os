import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase } from "@/server/db/client";
import { query } from "@/server/db";
import { getClientWorkspace } from "@/server/data";

import {
  createFreelancerService,
  createOnboardingClient,
  getClientSetup,
  getOnboardingBundle,
  listFreelancerServices,
  reorderFreelancerServices,
  updateClientSetup,
  updateFreelancerService,
  updateOnboarding,
} from "./domain";

const testDataDir = `.data/vitest-onboarding-${process.pid}-${Date.now()}`;

beforeAll(() => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
});

afterAll(async () => {
  await closeDatabase();
});

describe("onboarding V2.1 domain", () => {
  it("loads a progressive state and the owned dynamic catalog", async () => {
    const bundle = await getOnboardingBundle("martu");

    expect(bundle.onboarding).toMatchObject({
      status: "not_started",
      step: "welcome",
      completed: [],
      skipped: [],
      profileText: "",
      confirmedServiceIds: [],
    });
    expect(bundle.services.length).toBeGreaterThanOrEqual(13);
    expect(bundle.services).toContainEqual(
      expect.objectContaining({
        name: "Google Ads",
        icon: "badge-dollar-sign",
        active: true,
      }),
    );
    expect(bundle.clients).toHaveLength(5);
  }, 30_000);

  it("persists only the explicitly confirmed profile selection", async () => {
    const services = await listFreelancerServices("martu", false);
    const chosen = services.slice(0, 3).map((service) => service.id);
    const updated = await updateOnboarding("martu", {
      status: "in_progress",
      step: "client",
      completed: ["welcome", "profile", "services"],
      profileText: "Hago estrategia, contenido y planificación.",
      confirmedServiceIds: chosen,
      confirmed: true,
    });

    expect(updated.onboarding).toMatchObject({
      status: "in_progress",
      step: "client",
      completed: ["welcome", "profile", "services"],
      profileText: "Hago estrategia, contenido y planificación.",
      confirmedServiceIds: chosen,
    });
    await expect(
      updateOnboarding("martu", {
        confirmed: true,
        confirmedServiceIds: ["999999"],
      }),
    ).rejects.toThrow("no pertenece a tu catálogo");
  });

  it("creates, renames, reorders and archives a custom service", async () => {
    const created = await createFreelancerService("martu", {
      name: "Cobertura de eventos",
      icon: "calendar-camera",
    });
    expect(created).toMatchObject({
      name: "Cobertura de eventos",
      icon: "calendar-camera",
      active: true,
    });

    const renamed = await updateFreelancerService("martu", created.id, {
      name: "Cobertura en vivo",
      icon: "radio",
    });
    expect(renamed).toMatchObject({
      name: "Cobertura en vivo",
      icon: "radio",
    });

    const active = await listFreelancerServices("martu", false);
    const reversedIds = active.map((service) => service.id).reverse();
    const reordered = await reorderFreelancerServices("martu", reversedIds);
    expect(reordered.filter((service) => service.active).map((service) => service.id))
      .toEqual(reversedIds);

    const archived = await updateFreelancerService("martu", created.id, {
      active: false,
    });
    expect(archived.active).toBe(false);
    expect((await listFreelancerServices("martu", false)).some(
      (service) => service.id === created.id,
    )).toBe(false);
  });

  it("creates a quick client and keeps brief/strategy optional", async () => {
    const services = await listFreelancerServices("martu", false);
    const publishing = services.find((service) => service.name === "Publicación")!;
    const other = services.find((service) => service.id !== publishing.id)!;
    const serviceIds = [publishing.id, other.id];
    const created = await createOnboardingClient("martu", {
      name: "Cliente QA",
      description: "Marca de prueba",
      color: "#345678",
      logoUrl: null,
      serviceIds,
    });

    expect(created.client).toMatchObject({
      slug: "cliente-qa",
      name: "Cliente QA",
      color: "#345678",
      serviceIds,
    });
    expect(created.setup).toMatchObject({
      nonBlocking: true,
      strategy: null,
    });
    expect(created.setup.brief?.status).toBe("missing");
    const workflowBefore = await query<{ slug: string; is_visible: boolean }>(
      `select ws.slug, ws.is_visible from public.content_workflow_states ws
      join public.content_workflows w on w.id = ws.workflow_id
      where w.client_id = $1 and ws.slug in ('scheduled','published','delivered')
      order by ws.position`,
      [created.client.id],
    );
    expect(workflowBefore.find((row) => row.slug === "scheduled")?.is_visible)
      .toBe(true);
    expect(workflowBefore.find((row) => row.slug === "delivered")?.is_visible)
      .toBe(false);

    const incompleteBrief = await updateClientSetup(
      "martu",
      created.client.slug,
      {
        brief: {
          businessDescription: "Ayuda a comercios de cercanía.",
          source: "voice",
          confirmed: true,
        },
      },
    );
    expect(incompleteBrief.setup.brief?.status).toBe("draft");
    expect(incompleteBrief.setup.pending).toContain("brief");

    const configured = await updateClientSetup("martu", created.client.slug, {
      serviceIds: [other.id],
      brief: {
        businessDescription: "Ayuda a comercios de cercanía.",
        audience: "Dueños de comercios chicos.",
        desiredOutcomes: ["Conseguir consultas"],
        source: "voice",
        confirmed: true,
      },
      strategy: { deferred: true },
      channels: { instagram: "@clienteqa" },
    });
    expect(configured.setup.brief).toMatchObject({
      status: "complete",
      source: "voice",
      confirmedAt: expect.any(String),
    });
    expect(configured.setup.strategy).toBeNull();
    expect(configured.setup.strategyDeferred).toBe(true);
    expect(configured.setup.complete).toContain("instagram");
    const workflowAfter = await query<{ slug: string; is_visible: boolean }>(
      `select ws.slug, ws.is_visible from public.content_workflow_states ws
      join public.content_workflows w on w.id = ws.workflow_id
      where w.client_id = $1 and ws.slug in ('scheduled','published','delivered')
      order by ws.position`,
      [created.client.id],
    );
    expect(workflowAfter.find((row) => row.slug === "scheduled")?.is_visible)
      .toBe(false);
    expect(workflowAfter.find((row) => row.slug === "delivered")?.is_visible)
      .toBe(true);

    const persisted = await getClientSetup("martu", created.client.slug);
    expect(persisted.setup.brief?.businessDescription).toBe(
      "Ayuda a comercios de cercanía.",
    );
    expect(persisted.setup.pending).toContain("strategy");

    const withStrategy = await updateClientSetup("martu", created.client.slug, {
      strategy: {
        title: "Estrategia inicial",
        sourceType: "paste",
        sourceText: "Priorizar consultas calificadas.",
        confirmed: true,
      },
    });
    expect(withStrategy.setup.strategy).toMatchObject({
      title: "Estrategia inicial",
      status: "active",
      sourceType: "paste",
      sourceText: "Priorizar consultas calificadas.",
      confirmedAt: expect.any(String),
    });
    expect(withStrategy.setup.strategyDeferred).toBe(false);
    expect(withStrategy.setup.complete).toContain("strategy");

    const workspace = await getClientWorkspace(created.client.slug);
    expect(workspace.brief?.summary).toBe(
      "Ayuda a comercios de cercanía.",
    );
    expect(workspace.strategy?.title).toBe("Estrategia inicial");
  });
});
