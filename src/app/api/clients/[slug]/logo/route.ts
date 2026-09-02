import { requireMartuSession } from "@/server/auth";
import {
  ClientLogoInputError,
  getClientLogo,
  removeClientLogo,
  saveClientLogo,
} from "@/server/assets/client-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

function apiError(error: unknown) {
  const status = error instanceof ClientLogoInputError
    ? 400
    : error instanceof Error && error.name === "MartuAuthenticationError"
      ? 401
      : error instanceof Error && /No encontré ese cliente/.test(error.message)
        ? 404
        : 500;
  return Response.json(
    { message: error instanceof Error ? error.message : "No pude guardar la imagen." },
    { status },
  );
}

async function clientSlug(context: Context) {
  const { slug } = await context.params;
  return decodeURIComponent(slug);
}

export async function GET(_request: Request, context: Context) {
  try {
    const session = await requireMartuSession();
    const logo = await getClientLogo(session.userSlug, await clientSlug(context));
    if (!logo) return new Response(null, { status: 404 });
    const source = logo.image_data;
    const bytes = source instanceof Uint8Array
      ? new Uint8Array(source)
      : new Uint8Array(source as ArrayBuffer);
    return new Response(bytes, {
      headers: {
        "Content-Type": String(logo.mime_type),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireMartuSession();
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) {
      throw new ClientLogoInputError("Elegí una imagen para continuar.");
    }
    const bytes = new Uint8Array(await image.arrayBuffer());
    const logoUrl = await saveClientLogo(
      session.userSlug,
      await clientSlug(context),
      bytes,
      image.type,
    );
    return Response.json({ logoUrl });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await requireMartuSession();
    await removeClientLogo(session.userSlug, await clientSlug(context));
    return Response.json({ logoUrl: null });
  } catch (error) {
    return apiError(error);
  }
}

