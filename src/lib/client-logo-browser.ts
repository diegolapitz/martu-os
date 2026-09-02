export type PreparedClientLogo = { file: File; previewUrl: string; suggestedAccent: string | null };

const SOURCE_MAX_BYTES = 12_000_000;
const OUTPUT_SIZE = 512;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function dominantAccent(data: Uint8ClampedArray) {
  const buckets = new Map<string, number>();
  for (let index = 0; index < data.length; index += 16) {
    const red = data[index] ?? 0;
    const green = data[index + 1] ?? 0;
    const blue = data[index + 2] ?? 0;
    const high = Math.max(red, green, blue);
    const low = Math.min(red, green, blue);
    const saturation = high - low;
    if (high < 42 || high > 238 || saturation < 28) continue;
    const key = `${Math.round(red / 32)}-${Math.round(green / 32)}-${Math.round(blue / 32)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + saturation);
  }
  const winner = [...buckets.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!winner) return null;
  const [red, green, blue] = winner.split("-").map((part) => Math.min(255, Number(part) * 32));
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export async function getClientLogoSuggestedAccent(url: string): Promise<string | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  const sourceUrl = URL.createObjectURL(await response.blob());
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("No pude leer esa imagen."));
      element.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const scale = Math.max(128 / image.width, 128 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height);
    return dominantAccent(context.getImageData(0, 0, 128, 128).data);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** Prepares camera and desktop images for the small client identity slot. */
export async function prepareClientLogo(source: File): Promise<PreparedClientLogo> {
  if (!ACCEPTED_TYPES.has(source.type)) throw new Error("Elegí una imagen JPG, PNG o WebP.");
  if (source.size > SOURCE_MAX_BYTES) throw new Error("La imagen pesa demasiado. El máximo es 12 MB.");

  const sourceUrl = URL.createObjectURL(source);
  let image: ImageBitmap | HTMLImageElement | undefined;
  try {
    if ("createImageBitmap" in window) {
      image = await createImageBitmap(source);
    } else {
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("No pude leer esa imagen."));
        element.src = sourceUrl;
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pude preparar esa imagen.");
    const scale = Math.max(OUTPUT_SIZE / image.width, OUTPUT_SIZE / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (OUTPUT_SIZE - width) / 2, (OUTPUT_SIZE - height) / 2, width, height);
    const suggestedAccent = dominantAccent(context.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE).data);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob || blob.type !== "image/webp") throw new Error("Este navegador no pudo optimizar la imagen.");
    if (blob.size > 750_000) throw new Error("La imagen sigue siendo demasiado pesada. Probá con otra.");
    const baseName = source.name.replace(/\.[^.]+$/, "") || "logo";
    const file = new File([blob], `${baseName}.webp`, { type: blob.type });
    return { file, previewUrl: URL.createObjectURL(file), suggestedAccent };
  } finally {
    URL.revokeObjectURL(sourceUrl);
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
  }
}

export async function saveClientLogo(slug: string, file: File): Promise<string> {
  const form = new FormData();
  form.set("image", file);
  const response = await fetch(`/api/clients/${encodeURIComponent(slug)}/logo`, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({})) as { logoUrl?: string; message?: string };
  if (!response.ok || !payload.logoUrl) throw new Error(payload.message || "No pude subir la imagen.");
  return payload.logoUrl;
}

export async function removeClientLogo(slug: string): Promise<void> {
  const response = await fetch(`/api/clients/${encodeURIComponent(slug)}/logo`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message || "No pude quitar la imagen.");
  }
}
