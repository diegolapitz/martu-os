import { ClientWorkspace } from "@/components/client-workspace";
import type { ClientWorkspaceData } from "@/components/types";
import { ClientNotFoundError, getClientWorkspace } from "@/server/data";
import { notFound } from "next/navigation";

// Client workspaces are operational views. A mutation followed by a deep link
// must always see the exact entity that was just created.
export const dynamic = "force-dynamic";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; section?: string[] }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug, section } = await params;
  const query = await searchParams;
  const requestedTab = section?.[0] || "resumen";
  const requestedEntityId = section?.[1] || null;
  let data: Awaited<ReturnType<typeof getClientWorkspace>>;
  try {
    data = await getClientWorkspace(slug, { tab: requestedTab });
  } catch (error) {
    if (error instanceof ClientNotFoundError) notFound();
    throw error;
  }
  return (
    <ClientWorkspace
      data={data as ClientWorkspaceData}
      requestedTab={requestedTab}
      requestedEntityId={requestedEntityId}
      openCreate={query.new === "1"}
    />
  );
}
