import { ClientsView } from "@/components/clients-view";
import type { ClientSummary } from "@/components/types";
import { listClients } from "@/server/data";

export const metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listClients();
  return <ClientsView clients={clients as ClientSummary[]} />;
}
