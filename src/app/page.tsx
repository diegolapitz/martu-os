import { redirect } from "next/navigation";

import { LoginScreen } from "@/components/login-screen";
import { authMode, readMartuSession } from "@/server/auth";
import { getOnboardingBundle } from "@/server/onboarding";

export default async function Home({ searchParams }: { searchParams: Promise<{ authError?: string; next?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/day";
  const session = await readMartuSession();
  if (session) {
    const { onboarding } = await getOnboardingBundle(session.userSlug);
    redirect(["completed", "skipped"].includes(onboarding.status) ? nextPath : "/onboarding");
  }
  const initialError = params.authError === "expired-link"
    ? "Ese enlace venció o ya fue usado. Pedí uno nuevo."
    : params.authError
      ? "Ese enlace no se pudo validar."
      : "";
  return <LoginScreen authMode={authMode()} initialError={initialError} nextPath={nextPath} />;
}

