import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closeDatabase } from "@/server/db/client";

import {
  archiveManagedMemory,
  correctManagedMemory,
  createManagedMemory,
  listManagedMemories,
} from "./memory-domain";
import { listMemories } from "./queries";

const testDataDir = `.data/vitest-memory-domain-${process.pid}-${Date.now()}`;

beforeAll(() => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
});

afterAll(async () => {
  await closeDatabase();
});

describe("managed memory lifecycle", () => {
  it("creates, versions and forgets a client memory without leaking stale facts", async () => {
    const created = await createManagedMemory({
      scope: "client",
      clientSlug: "gavilan",
      category: "preferencia",
      fact: "Prefiere aperturas con una pregunta.",
      importance: 4,
    });

    expect(created).toMatchObject({
      scope: "client",
      clientSlug: "gavilan",
      lifecycleStatus: "active",
      importance: 4,
    });

    const corrected = await correctManagedMemory(created.id, {
      fact: "Prefiere aperturas con una afirmación directa.",
      importance: 5,
    });
    expect(corrected).toMatchObject({
      fact: "Prefiere aperturas con una afirmación directa.",
      supersedesId: created.id,
      lifecycleStatus: "active",
      importance: 5,
    });

    const afterCorrection = await listManagedMemories({
      clientSlug: "gavilan",
      includeGlobal: false,
      limit: 200,
    });
    expect(afterCorrection.some((memory) => memory.id === created.id)).toBe(
      false,
    );
    expect(afterCorrection.some((memory) => memory.id === corrected.id)).toBe(
      true,
    );
    const agentContextAfterCorrection = await listMemories({
      clientSlug: "gavilan",
      includeGlobal: true,
      limit: 200,
    });
    expect(
      agentContextAfterCorrection.some((memory) => memory.id === created.id),
    ).toBe(false);
    expect(
      agentContextAfterCorrection.some((memory) => memory.id === corrected.id),
    ).toBe(true);

    const forgotten = await archiveManagedMemory(corrected.id, "forget");
    expect(forgotten.lifecycleStatus).toBe("forgotten");
    expect(forgotten.forgottenAt).toBeTruthy();

    const afterForget = await listManagedMemories({
      clientSlug: "gavilan",
      includeGlobal: true,
      limit: 200,
    });
    expect(afterForget.some((memory) => memory.id === corrected.id)).toBe(
      false,
    );
    const agentContextAfterForget = await listMemories({
      clientSlug: "gavilan",
      includeGlobal: true,
      limit: 200,
    });
    expect(
      agentContextAfterForget.some((memory) => memory.id === corrected.id),
    ).toBe(false);
  }, 30_000);

  it("keeps global and client scopes explicit", async () => {
    const global = await createManagedMemory({
      scope: "global",
      category: "forma de trabajo",
      fact: "Mostrar primero el resultado.",
    });
    const client = await createManagedMemory({
      scope: "client",
      clientSlug: "luma-estudio",
      category: "tono",
      fact: "Evitar tecnicismos en los copies.",
    });

    const clientOnly = await listManagedMemories({
      scope: "client",
      clientSlug: "luma-estudio",
      includeGlobal: false,
      limit: 200,
    });
    expect(clientOnly.some((memory) => memory.id === client.id)).toBe(true);
    expect(clientOnly.some((memory) => memory.id === global.id)).toBe(false);

    const withGlobal = await listManagedMemories({
      clientSlug: "luma-estudio",
      includeGlobal: true,
      limit: 200,
    });
    expect(withGlobal.some((memory) => memory.id === client.id)).toBe(true);
    expect(withGlobal.some((memory) => memory.id === global.id)).toBe(true);
  }, 30_000);
});
