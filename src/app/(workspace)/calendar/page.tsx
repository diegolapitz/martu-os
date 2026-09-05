import { CalendarV1 } from "@/components/calendar-v1";

export const metadata = { title: "Calendario" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const query = await searchParams;
  return <CalendarV1 openCreate={query.new === "1"} />;
}
