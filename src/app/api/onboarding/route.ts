import { readJson, jsonOk } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth";
import {
  getOnboardingBundle,
  onboardingApiError,
  onboardingPatchSchema,
  updateOnboarding,
} from "@/server/onboarding";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireMartuSession();
    return jsonOk(await getOnboardingBundle(session.userSlug));
  } catch (error) {
    return onboardingApiError(error, "No pude cargar el onboarding.");
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireMartuSession();
    const input = onboardingPatchSchema.parse(await readJson(request));
    return jsonOk(await updateOnboarding(session.userSlug, input));
  } catch (error) {
    return onboardingApiError(error, "No pude guardar el onboarding.");
  }
}

