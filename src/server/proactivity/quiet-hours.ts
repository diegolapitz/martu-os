import { formatInTimeZone } from "date-fns-tz";

import { MARTU_TIME_ZONE } from "@/server/agent/types";

export function isQuietTime(now: Date, start: string, end: string): boolean {
  const current = toMinutes(formatInTimeZone(now, MARTU_TIME_ZONE, "HH:mm"));
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
