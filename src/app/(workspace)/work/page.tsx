import { WorkView } from "@/components/work-view";
import type { DayData } from "@/components/types";
import { getDayData } from "@/server/data";

export const metadata = { title: "Trabajo" };
export const dynamic = "force-dynamic";

export default async function WorkPage() {
  const data = await getDayData();
  return <WorkView data={data as DayData} />;
}
