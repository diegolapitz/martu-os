import { jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth";
import {
  createClientSchema,
  createOnboardingClient,
  onboardingApiError,
} from "@/server/onboarding";

export const runtime = "nodejs";

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

