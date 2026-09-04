import { jsonError, jsonOk } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";
import { runAsSystemUser } from "@/server/auth";
import { query } from "@/server/db";
import { authorizeCron } from "@/server/proactivity/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = authorizeCron(request);
  if (!authorization.ok) return jsonOk({ error: "unauthorized", message: authorization.message }, { status: authorization.status });
  try {
    const users = await query<{ id: string }>(
      `select id from public.users
       where auth_user_id is not null
          or (slug = 'martu' and not exists (
            select 1 from public.users where auth_user_id is not null
          ))
       order by (auth_user_id is not null) desc, created_at
       limit 2`,
    );
    if (!users[0]) throw new Error("No hay un espacio personal para ejecutar el cron.");
    if (users.length > 1 && process.env.NODE_ENV === "production") {
      throw new Error("El cron de alpha admite un único espacio personal.");
    }
    const result = await runAsSystemUser(String(users[0].id), () =>
      getMartuRuntime().proactivity.tick(new Date()),
    );
    return jsonOk({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (error) {
    return jsonError(error);
  }
}
