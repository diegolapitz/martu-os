import { jsonError, jsonOk } from "@/server/agent/http";
import { authorizeCron } from "@/server/proactivity/cron-auth";
import { MartuPushSubscriptionRepository } from "@/server/push/data-repository";
import { WebPushNotificationProvider } from "@/server/push/web-push-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cronAuthorization = authorizeCron(request);
  const smokeSecret = process.env.PUSH_TEST_TOKEN?.trim();
  const smokeAuthorization = smokeSecret ? authorizeCron(request, smokeSecret) : undefined;
  if (!cronAuthorization.ok && !smokeAuthorization?.ok) {
    return jsonOk(
      { error: "unauthorized", message: cronAuthorization.message },
      { status: cronAuthorization.status },
    );
  }

  try {
    const provider = new WebPushNotificationProvider(new MartuPushSubscriptionRepository());
    const delivery = await provider.deliver({
      title: "Martu OS · prueba lista",
      body: "Web Push funciona desde cloud. No depende de tu PC.",
      tag: "martu-os-push-test",
      deepLink: "/settings",
      data: { quickActions: [] },
    });
    return jsonOk(
      { ok: delivery.accepted, delivery },
      { status: delivery.accepted ? 200 : 503 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
