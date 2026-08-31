import { DayView } from "@/components/day-view";
import type { DayData } from "@/components/types";
import { getDayData } from "@/server/data";

export const metadata = { title: "Mi día" };
export const dynamic = "force-dynamic";

export default async function DayPage() {
  const data = await getDayData();
  return <DayView data={data as DayData} />;
}
