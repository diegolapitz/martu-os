import { jsonOk, readJson } from "@/server/agent/http";
import { requireMartuSession } from "@/server/auth";
import {
  createFreelancerService,
  createServiceSchema,
  listFreelancerServices,
  onboardingApiError,
} from "@/server/onboarding";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireMartuSession();
    const includeArchived =
      new URL(request.url).searchParams.get("includeArchived") === "true";
    const services = await listFreelancerServices(
      session.userSlug,
      includeArchived,
    );
    return jsonOk({ services });
  } catch (error) {
    return onboardingApiError(error, "No pude cargar tus servicios.");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireMartuSession();
    const input = createServiceSchema.parse(await readJson(request));
    const service = await createFreelancerService(session.userSlug, input);
    return jsonOk({ service }, { status: 201 });
  } catch (error) {
    return onboardingApiError(error, "No pude crear el servicio.");
  }
}

