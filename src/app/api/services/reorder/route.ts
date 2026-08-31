import { jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth";
import {
  onboardingApiError,
  reorderFreelancerServices,
  reorderServicesSchema,
} from "@/server/onboarding";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const session = await requireMartuSession();
    const input = reorderServicesSchema.parse(await readJson(request));
    const services = await reorderFreelancerServices(
      session.userSlug,
      input.serviceIds,
    );
    return jsonOk({ services });
  } catch (error) {
    return onboardingApiError(error, "No pude guardar el orden.");
  }
}

