import { NextResponse } from "next/server";
import { z } from "zod";

import { getCommunicationProfile, updateCommunicationProfile } from "@/server/data";
import { requireAppUser, updateAppUserProfile } from "@/server/auth";

export const runtime = "nodejs";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Usá un horario válido.");
const profileSchema = z.object({
  insistenceLevel: z.number().int().min(1).max(5),
  quietHoursStart: time,
  quietHoursEnd: time,
  morningBriefingEnabled: z.boolean(),
  middayCheckEnabled: z.boolean(),
  endOfDayEnabled: z.boolean(),
  explicitPreferences: z.array(z.string().trim().min(1).max(500)).max(12),
  name: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(20_000).optional(),
});

export async function GET() {
  try {
    const profile = await getCommunicationProfile();
    const user = await requireAppUser();
    return NextResponse.json({ profile, user });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No pude cargar tus preferencias." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const input = profileSchema.parse(await request.json());
    const profile = await updateCommunicationProfile(input);
    const user = await updateAppUserProfile({ name: input.name, timezone: input.timezone, description: input.description });
    return NextResponse.json({ profile, user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.issues[0]?.message ?? "Las preferencias no son válidas.", issues: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No pude guardar tus preferencias." },
      { status: 500 },
    );
  }
}
