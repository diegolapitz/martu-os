import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getClientWorkspace, listClients, query } from "@/server/data";
import { closeDatabase } from "@/server/db/client";

import { runAsTestUser } from "./app-user";

const testDataDir = `.data/vitest-auth-isolation-${process.pid}-${Date.now()}`;
let alphaUserId = "";

beforeAll(async () => {
  process.env.DB_MODE = "pglite";
  process.env.PGLITE_DATA_DIR = testDataDir;
  const users = await query<{ id: string }>(
    `insert into public.users (slug, name, email)
     values ('alpha-owner', 'Alpha Owner', 'alpha@example.test')
     returning id`,
  );
  alphaUserId = String(users[0]!.id);
  await query(
    `insert into public.clients (user_id, slug, name, description)
     values ($1, 'alpha-only', 'Alpha Only', 'Privado')`,
    [alphaUserId],
  );
}, 30_000);

afterAll(async () => {
  await closeDatabase();
});

describe("authenticated data isolation", () => {
  it("lists only the current profile's clients", async () => {
    const alphaClients = await runAsTestUser(alphaUserId, () => listClients());
    expect(alphaClients.map((client) => client.slug)).toEqual(["alpha-only"]);

    const martu = await query<{ id: string }>(
      "select id from public.users where slug = 'martu' limit 1",
    );
    const martuClients = await runAsTestUser(String(martu[0]!.id), () => listClients());
    expect(martuClients.some((client) => client.slug === "alpha-only")).toBe(false);
  });

  it("does not open another profile's client workspace", async () => {
    await expect(
      runAsTestUser(alphaUserId, () => getClientWorkspace("gavilan")),
    ).rejects.toThrow(/not found|No encontré/u);
  });
});
