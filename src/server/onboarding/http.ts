import { ZodError } from "zod";

import { MartuAuthenticationError } from "@/server/auth";
import { jsonOk } from "@/server/agent/http";

import {
  OnboardingConflictError,
  OnboardingNotFoundError,
} from "./domain";

export function onboardingApiError(
  error: unknown,
  fallback: string,
): Response {
  if (error instanceof ZodError) {
    return jsonOk(
      {
        message: error.issues[0]?.message ?? "Hay datos inválidos.",
        issues: error.issues,
      },
      { status: 400 },
    );
  }
  const status =
    error instanceof MartuAuthenticationError
      ? 401
      : error instanceof OnboardingNotFoundError
        ? 404
        : error instanceof OnboardingConflictError
          ? 409
          : databaseConflict(error)
            ? 409
            : inputError(error)
              ? 400
              : 500;
  return jsonOk(
    { message: error instanceof Error ? error.message : fallback },
    { status },
  );
}

function databaseConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "23505" || /unique constraint|duplicate key/i.test(error.message);
}

function inputError(error: unknown): boolean {
  return (
    error instanceof URIError ||
    (error instanceof Error &&
      /JSON válido|pedido es demasiado grande|identificador.*inválido/i.test(
        error.message,
      ))
  );
}
