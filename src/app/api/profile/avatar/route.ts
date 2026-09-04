import {
  getUserAvatar,
  removeUserAvatar,
  saveUserAvatar,
  UserAvatarInputError,
} from "@/server/assets/user-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function apiError(error: unknown) {
  const status =
    error instanceof UserAvatarInputError
      ? 400
      : error instanceof Error &&
          ["MartuAuthenticationError", "AppAuthenticationError"].includes(error.name)
        ? 401
        : 500;
  return Response.json(
    {
      message:
        error instanceof Error ? error.message : "No pude guardar tu foto.",
    },
    { status },
  );
}

export async function GET() {
  try {
    const avatar = await getUserAvatar();
    if (!avatar) return new Response(null, { status: 404 });
    const source = avatar.image_data;
    const bytes =
      source instanceof Uint8Array
        ? new Uint8Array(source)
        : new Uint8Array(source as ArrayBuffer);
    return new Response(bytes, {
      headers: {
        "Content-Type": String(avatar.mime_type),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) {
      throw new UserAvatarInputError("Elegí una imagen para continuar.");
    }
    const avatarUrl = await saveUserAvatar(
      new Uint8Array(await image.arrayBuffer()),
      image.type,
    );
    return Response.json({ avatarUrl });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE() {
  try {
    await removeUserAvatar();
    return Response.json({ avatarUrl: null });
  } catch (error) {
    return apiError(error);
  }
}
