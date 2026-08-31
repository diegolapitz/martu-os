import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Este comando envía una notificación real. Volvé a ejecutarlo con --confirm.");
  }

  const urlArgument = process.argv.find((argument) => argument.startsWith("--url="));
  const appUrl = (urlArgument?.slice("--url=".length) || process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!appUrl || !cronSecret) throw new Error("Faltan NEXT_PUBLIC_APP_URL o CRON_SECRET.");

  const response = await fetch(`${appUrl}/api/push/test`, {
    method: "POST",
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const payload = await response.json() as {
    message?: string;
    delivery?: { accepted?: boolean; reason?: string; details?: unknown };
  };
  if (!response.ok || !payload.delivery?.accepted) {
    throw new Error(payload.delivery?.reason || payload.message || "El proveedor Web Push rechazó la prueba.");
  }

  console.log(JSON.stringify({ delivered: true, statusCode: response.status, details: payload.delivery.details }));
}

main().catch((error: unknown) => {
  const statusCode = typeof error === "object" && error !== null
    ? Reflect.get(error, "statusCode")
    : null;
  console.error(JSON.stringify({
    delivered: false,
    statusCode: typeof statusCode === "number" ? statusCode : null,
    message: error instanceof Error ? error.message : "Falló la prueba Web Push.",
  }));
  process.exitCode = 1;
});
