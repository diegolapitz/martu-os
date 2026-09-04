import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

import { closeDatabase } from "../src/server/db/client";
import { query, transaction } from "../src/server/db";

for (const file of [".env.local", ".env"]) if (existsSync(file)) loadEnvFile(file);

type Row = Record<string, unknown>;

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Este reset está deshabilitado en producción.");
  }

  const slug = argument("slug")?.trim();
  const confirmation = argument("confirm")?.trim();
  const eraseData = process.argv.includes("--erase-personal-data");
  if (!slug || confirmation !== slug) {
    throw new Error(
      "Indicá el perfil dos veces: --slug=<slug> --confirm=<slug>. Sumá --erase-personal-data sólo si también querés borrar su espacio.",
    );
  }

  const users = await query<Row>(
    "select id, slug, email from public.users where slug = $1 limit 1",
    [slug],
  );
  const user = users[0];
  if (!user) throw new Error(`No existe el perfil ${slug}.`);

  if (eraseData) {
    await query("delete from public.users where id = $1", [user.id]);
    console.log(`Perfil y datos personales eliminados para ${slug}. La cuenta Auth no fue eliminada.`);
    return;
  }

  await transaction(async (tx) => {
    await tx.query(
      `insert into public.onboarding_states (user_id)
       values ($1)
       on conflict (user_id) do update set
         status = 'not_started', current_step = 'welcome',
         completed_steps = '{}', skipped_steps = '{}', profile_text = '',
         confirmed_service_ids = '{}', started_at = null,
         completed_at = null, skipped_at = null, updated_at = now()`,
      [user.id],
    );
  });
  console.log(`First run reiniciado para ${slug}. Sus datos personales se conservaron.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
