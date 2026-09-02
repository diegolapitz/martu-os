import { jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth";
import {
  createClientSchema,
  createOnboardingClient,
  onboardingApiError,
} from "@/server/onboarding";
import { listClients } from "@/server/data";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireMartuSession();
    return jsonOk({ clients: await listClients() });
  } catch (error) {
    return onboardingApiError(error, "No pude cargar los clientes.");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireMartuSession();
    const input = createClientSchema.parse(await readJson(request));
    return jsonOk(
      await createOnboardingClient(session.userSlug, input),
      { status: 201 },
    );
  } catch (error) {
    return onboardingApiError(error, "No pude crear el cliente.");
  }
}
