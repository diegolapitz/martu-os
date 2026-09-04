import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.email("Escribí un email válido.").trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Usá al menos 8 caracteres.")
    .max(256, "La contraseña es demasiado larga."),
});

export const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2, "Contame cómo te llamás.").max(100),
});

export const resetSchema = z.object({
  email: z.email("Escribí un email válido.").trim().toLowerCase(),
});

export const passwordSchema = z.object({
  password: z
    .string()
    .min(8, "Usá al menos 8 caracteres.")
    .max(256, "La contraseña es demasiado larga."),
});

export function authErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  if (/invalid login credentials/iu.test(message)) {
    return "Ese email o esa contraseña no coinciden.";
  }
  if (/email not confirmed/iu.test(message)) {
    return "Revisá tu email y confirmá la cuenta para entrar.";
  }
  if (/user already registered|already been registered/iu.test(message)) {
    return "Ya existe una cuenta con ese email. Probá iniciar sesión.";
  }
  if (/password should be at least/iu.test(message)) {
    return "Usá al menos 8 caracteres para tu contraseña.";
  }
  if (/rate limit|security purposes/iu.test(message)) {
    return "Esperá un momento antes de volver a intentarlo.";
  }
  return fallback;
}
