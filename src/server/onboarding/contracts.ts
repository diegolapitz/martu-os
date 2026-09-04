import { z } from "zod";

import { ONBOARDING_STATUSES, ONBOARDING_STEPS } from "./types";

export const numericIdSchema = z.string().regex(/^\d+$/, "El identificador no es válido.");
export const iconSchema = z
  .string()
  .trim()
  .min(1, "Elegí un icono.")
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, "El icono no es válido.");
export const colorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Elegí un color válido.");

const urlOrPathSchema = z
  .string()
  .trim()
  .max(2_000)
  .refine(
    (value) => value.startsWith("/") || /^https?:\/\//i.test(value),
    "La URL no es válida.",
  );

const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length;

export const onboardingPatchSchema = z
  .object({
    status: z.enum(ONBOARDING_STATUSES).optional(),
    step: z.enum(ONBOARDING_STEPS).optional(),
    completed: z
      .array(z.enum(ONBOARDING_STEPS))
      .max(ONBOARDING_STEPS.length)
      .refine(uniqueIds, "No repitas pasos completados.")
      .optional(),
    skipped: z
      .array(z.enum(ONBOARDING_STEPS))
      .max(ONBOARDING_STEPS.length)
      .refine(uniqueIds, "No repitas pasos salteados.")
      .optional(),
    profileText: z.string().trim().max(20_000).optional(),
    profileName: z.string().trim().min(1, "Decinos cómo querés que te llamemos.").max(120).optional(),
    timezone: z.string().trim().min(1).max(100).regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/, "La zona horaria no es válida.").optional(),
    confirmedServiceIds: z
      .array(numericIdSchema)
      .min(1, "Elegí al menos un servicio.")
      .max(60)
      .refine(uniqueIds, "No repitas servicios.")
      .optional(),
    confirmed: z.literal(true).optional(),
  })
  .superRefine((value, context) => {
    const changesProfile =
      value.profileText !== undefined || value.profileName !== undefined || value.timezone !== undefined || value.confirmedServiceIds !== undefined;
    if (changesProfile && value.confirmed !== true) {
      context.addIssue({
        code: "custom",
        path: ["confirmed"],
        message: "Confirmá lo que entendimos antes de guardarlo.",
      });
    }
    if (value.completed && value.skipped) {
      const overlap = value.completed.find((step) => value.skipped?.includes(step));
      if (overlap) {
        context.addIssue({
          code: "custom",
          path: ["skipped"],
          message: `El paso ${overlap} no puede estar completo y salteado a la vez.`,
        });
      }
    }
    if (Object.keys(value).every((key) => key === "confirmed")) {
      context.addIssue({
        code: "custom",
        message: "No hay cambios para guardar.",
      });
    }
  });

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre al servicio.").max(100),
  icon: iconSchema.default("briefcase-business"),
});

export const updateServiceSchema = z
  .object({
    name: z.string().trim().min(1, "Poné un nombre al servicio.").max(100).optional(),
    icon: iconSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No hay cambios para guardar.");

export const reorderServicesSchema = z.object({
  serviceIds: z
    .array(numericIdSchema)
    .min(1, "No hay servicios para ordenar.")
    .max(60)
    .refine(uniqueIds, "No repitas servicios."),
});

export const createClientSchema = z.object({
  name: z.string().trim().min(1, "Poné el nombre del cliente.").max(120),
  description: z.string().trim().max(2_000).default(""),
  logoUrl: urlOrPathSchema.nullable().optional(),
  color: colorSchema.default("#496a50"),
  serviceIds: z
    .array(numericIdSchema)
    .min(1, "Elegí al menos un servicio para este cliente.")
    .max(60)
    .refine(uniqueIds, "No repitas servicios."),
});

const textListSchema = z.array(z.string().trim().min(1).max(1_000)).max(60);

export const clientSetupPatchSchema = z
  .object({
    serviceIds: z
      .array(numericIdSchema)
      .min(1, "Elegí al menos un servicio para este cliente.")
      .max(60)
      .refine(uniqueIds, "No repitas servicios.")
      .optional(),
    brief: z
      .object({
        status: z.enum(["missing", "draft", "complete"]).optional(),
        businessDescription: z.string().trim().max(8_000).optional(),
        objectives: textListSchema.optional(),
        audience: z.string().trim().max(8_000).optional(),
        differentiators: textListSchema.optional(),
        tone: z.string().trim().max(4_000).optional(),
        competitors: textListSchema.optional(),
        desiredOutcomes: textListSchema.optional(),
        avoidances: textListSchema.optional(),
        relevantLinks: z.array(urlOrPathSchema).max(30).optional(),
        source: z.enum(["manual", "voice", "upload", "questions"]).optional(),
        confirmed: z.boolean().optional(),
      })
      .optional(),
    strategy: z
      .object({
        deferred: z.boolean().optional(),
        title: z.string().trim().min(1).max(180).optional(),
        status: z.enum(["draft", "active", "archived"]).optional(),
        objectives: textListSchema.optional(),
        audience: z.string().trim().max(8_000).optional(),
        tone: z.string().trim().max(4_000).optional(),
        positioning: z.string().trim().max(8_000).optional(),
        pillars: textListSchema.optional(),
        notes: z.string().max(20_000).optional(),
        sourceType: z.enum(["manual", "voice", "upload", "paste", "questions"]).optional(),
        sourceUrl: urlOrPathSchema.nullable().optional(),
        sourceText: z.string().max(50_000).optional(),
        confirmed: z.boolean().optional(),
      })
      .optional(),
    channels: z
      .object({
        instagram: z.string().trim().max(500).nullable().optional(),
        metaAds: z.string().trim().max(500).nullable().optional(),
        calendarConnected: z.boolean().optional(),
        firstPlanningDone: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({ code: "custom", message: "No hay cambios para guardar." });
    }
    if (
      value.strategy?.deferred === true &&
      Object.keys(value.strategy).some((key) => key !== "deferred")
    ) {
      context.addIssue({
        code: "custom",
        path: ["strategy", "deferred"],
        message: "Elegí guardar la estrategia o dejarla para después.",
      });
    }
    if (value.brief?.source === "voice" && value.brief.confirmed !== true) {
      context.addIssue({
        code: "custom",
        path: ["brief", "confirmed"],
        message: "Confirmá la transcripción del brief antes de guardarla.",
      });
    }
    if (
      value.strategy?.sourceType === "voice" &&
      value.strategy.confirmed !== true
    ) {
      context.addIssue({
        code: "custom",
        path: ["strategy", "confirmed"],
        message: "Confirmá la transcripción de la estrategia antes de guardarla.",
      });
    }
  });

export type OnboardingPatchInput = z.infer<typeof onboardingPatchSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type ClientSetupPatchInput = z.infer<typeof clientSetupPatchSchema>;
