import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireAppUser } from "@/server/auth";
import { listClients } from "@/server/data";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await requireAppUser();
  const clients = await listClients();
  return <AppShell
    aiMode={process.env.OPENAI_API_KEY ? "real" : "demo"}
    user={{ name: user.preferredName || user.name, avatarUrl: user.avatarUrl }}
    initialClients={clients.map((client) => ({ slug: client.slug, name: client.name, accent: client.accent, logoUrl: client.logoUrl }))}
  >{children}</AppShell>;
}
