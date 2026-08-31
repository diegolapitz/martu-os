import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell aiMode={process.env.OPENAI_API_KEY ? "real" : "demo"}>{children}</AppShell>;
}
