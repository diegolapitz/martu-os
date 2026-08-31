import { jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth";
import {
  clientSetupPatchSchema,
  getClientSetup,
  onboardingApiError,
  updateClientSetup,
} from "@/server/onboarding";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const [session, { slug }] = await Promise.all([
      requireMartuSession(),
      context.params,
    ]);
    return jsonOk(
      await getClientSetup(session.userSlug, decodeURIComponent(slug)),
    );
  } catch (error) {
    return onboardingApiError(error, "No pude cargar la configuración.");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const [session, { slug }, input] = await Promise.all([
      requireMartuSession(),
      context.params,
      readJson(request).then((body) => clientSetupPatchSchema.parse(body)),
    ]);
    return jsonOk(
      await updateClientSetup(
        session.userSlug,
        decodeURIComponent(slug),
        input,
      ),
    );
  } catch (error) {
    return onboardingApiError(error, "No pude guardar la configuración.");
  }
}

