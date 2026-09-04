import { NextResponse } from "next/server";

import {
  assertAccessConfiguration,
  clearMartuSessionCookie,
  setMartuSessionCookie,
  verifyAccessCode,
} from "@/server/auth";
import { authMode } from "@/server/auth/config";

export async function POST(request: Request) {
  try {
  if (authMode() === "supabase") {
      return NextResponse.json(
        { message: "Usá tu email y contraseña para entrar." },
        { status: 410 },
      );
    }
    assertAccessConfiguration();
    const raw = await request.text();
    const body = raw ? JSON.parse(raw) as { code?: unknown } : {};
    const code = typeof body.code === "string" ? body.code : undefined;
    if (!verifyAccessCode(code)) {
      return NextResponse.json({ message: "Código de acceso incorrecto." }, { status: 401 });
    }
    await setMartuSessionCookie();
    return NextResponse.json({ ok: true, user: "Martu" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No pude iniciar la sesión.";
    const status = /required in production/i.test(message) ? 503 : /JSON/i.test(message) ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE() {
  await clearMartuSessionCookie();
  return NextResponse.json({ ok: true });
}
