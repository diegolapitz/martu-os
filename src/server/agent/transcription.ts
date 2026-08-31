import OpenAI, { toFile } from "openai";

export interface TranscriptionResult {
  mode: "real";
  text: string;
  model: string;
}

export async function transcribeAudio(file: File): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Para transcribir audio necesitás configurar OPENAI_API_KEY.");
  if (file.size === 0) throw new Error("El audio está vacío.");
  if (file.size > 25 * 1024 * 1024) throw new Error("El audio supera el límite de 25 MB.");
  const client = new OpenAI({ apiKey });
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = await toFile(bytes, file.name || "audio.webm", { type: file.type || "audio/webm" });
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe";
  const transcript = await client.audio.transcriptions.create({
    file: upload,
    model,
    language: "es",
    prompt: "Español rioplatense. Clientes frecuentes: Gavilán, Luma Estudio, Casa Norte, Brava Fit y Nido.",
  });
  return { mode: "real", text: transcript.text.trim(), model };
}
