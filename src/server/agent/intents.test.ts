import { describe, expect, it } from "vitest";

import { resolveRelativeDate } from "./date-language";
import { parseDemoIntent } from "./intents";

const clients = [
  { id: "1", slug: "gavilan", name: "Gavilán" },
  { id: "2", slug: "luma-estudio", name: "Luma Estudio" },
];

describe("parseDemoIntent", () => {
  const now = new Date("2026-08-29T15:00:00.000Z");

  it("persists the critical Luma promise as a structured commitment", () => {
    const intent = parseDemoIntent("Mañana termino el tercer reel de Luma.", { clients, now });
    expect(intent).toMatchObject({
      type: "commitment",
      clientSlug: "luma-estudio",
      entityType: "content",
      ordinal: 3,
      dueAt: "2026-08-30T21:00:00.000Z",
    });
  });

  it("understands the critical Gavilán third-script reschedule", () => {
    const intent = parseDemoIntent("Pasá el tercer guion de Gavilán al viernes", { clients, now });
    expect(intent).toMatchObject({
      type: "reschedule",
      clientSlug: "gavilan",
      entityType: "script",
      ordinal: 3,
      dueAt: "2026-09-04T21:00:00.000Z",
    });
  });

  it("uses the last referenced entity for a pronoun reschedule", () => {
    const intent = parseDemoIntent("Pasalo a mañana", {
      clients,
      now,
      lastReferencedEntity: { id: "33", type: "script", title: "Escapada sin organizar de más", clientSlug: "gavilan" },
    });
    expect(intent).toMatchObject({ type: "reschedule", entityType: "script", clientSlug: "gavilan" });
  });

  it("keeps the exact content target when a Web Push action asks to reschedule it", () => {
    const intent = parseDemoIntent("Pasalo a mañana", {
      clients,
      now,
      lastReferencedEntity: { id: "90", type: "content", title: "Historias · Desafío de movilidad", clientSlug: "gavilan" },
    });
    expect(intent).toMatchObject({ type: "reschedule", entityType: "content", clientSlug: "gavilan" });
  });

  it("keeps an explicit reminder hour in Buenos Aires time", () => {
    expect(resolveRelativeDate("mañana a las diez", now)?.toISOString()).toBe("2026-08-30T13:00:00.000Z");
  });

  it("understands plural metrics and campaigns in natural questions", () => {
    expect(parseDemoIntent("¿Cómo rindieron las métricas de Luma?", { clients, now })).toMatchObject({ type: "metrics_question", clientSlug: "luma-estudio" });
    expect(parseDemoIntent("¿Qué harías con las campañas de Gavilán?", { clients, now })).toMatchObject({ type: "ads_question", clientSlug: "gavilan" });
  });

  it("persists explicit memories and lower-insistence preferences in Demo mode", () => {
    expect(parseDemoIntent("Recordá que prefiero hooks directos para Gavilán", { clients, now })).toMatchObject({
      type: "save_memory", scope: "client", category: "preference", clientSlug: "gavilan",
    });
    expect(parseDemoIntent("No me jodas con esto", { clients, now })).toEqual({ type: "reduce_insistence" });
  });
});
