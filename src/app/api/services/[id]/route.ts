import { jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth";
import {
  numericIdSchema,
  onboardingApiError,
  updateFreelancerService,
  updateServiceSchema,
} from "@/server/onboarding";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionPromise = requireMartuSession();
    const paramsPromise = context.params;
    const inputPromise = readJson(request).then((body) =>
      updateServiceSchema.parse(body),
    );
    const [session, params, input] = await Promise.all([
      sessionPromise,
      paramsPromise,
      inputPromise,
    ]);
    const id = numericIdSchema.parse(params.id);
    const service = await updateFreelancerService(
      session.userSlug,
      id,
      input,
    );
    return jsonOk({ service });
  } catch (error) {
    return onboardingApiError(error, "No pude actualizar el servicio.");
  }
}

