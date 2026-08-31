import { addDays, setHours, setMinutes, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { MARTU_TIME_ZONE } from "./types";

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const HOUR_WORDS: Record<string, number> = {
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
};

export function normalizeSpanish(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSpokenHour(value: string): { hour: number; minute: number } | undefined {
  const normalized = normalizeSpanish(value);
  const numeric = normalized.match(/(?:a las?|tipo)\s+(\d{1,2})(?::(\d{2}))?/);
  if (numeric) {
    const hour = Number(numeric[1]);
    const minute = Number(numeric[2] ?? "0");
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return { hour, minute };
  }

  const word = normalized.match(/(?:a las?|tipo)\s+([a-z]+)/)?.[1];
  if (word && HOUR_WORDS[word] !== undefined) return { hour: HOUR_WORDS[word], minute: 0 };
  return undefined;
}

export function resolveRelativeDate(
  value: string,
  now = new Date(),
  defaultHour = 18,
): Date | undefined {
  const normalized = normalizeSpanish(value);
  const localNow = toZonedTime(now, MARTU_TIME_ZONE);
  let localTarget = startOfDay(localNow);

  if (/\bmanana\b/.test(normalized)) {
    localTarget = addDays(localTarget, 1);
  } else if (/\bhoy\b/.test(normalized)) {
    // Same local day.
  } else {
    const weekday = Object.keys(WEEKDAYS).find((name) => new RegExp(`\\b${name}\\b`).test(normalized));
    if (!weekday) return undefined;
    const wanted = WEEKDAYS[weekday];
    let delta = (wanted - localNow.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    localTarget = addDays(localTarget, delta);
  }

  const spoken = parseSpokenHour(normalized);
  localTarget = setHours(localTarget, spoken?.hour ?? defaultHour);
  localTarget = setMinutes(localTarget, spoken?.minute ?? 0);
  return fromZonedTime(localTarget, MARTU_TIME_ZONE);
}

export function endOfLocalDay(value: Date): Date {
  const local = toZonedTime(value, MARTU_TIME_ZONE);
  return fromZonedTime(setMinutes(setHours(local, 23), 59), MARTU_TIME_ZONE);
}
