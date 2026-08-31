import type { ReactNode } from "react";
import { Check, ChevronRight, Clock } from "lucide-react";

export function StatusDot({ tone = "success" }: { tone?: "success" | "warning" | "danger" | "neutral" }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}

export function SectionTitle({ icon, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>{icon}{children}</div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__mark"><Check size={18} /></div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

export function TimeAgo({ value }: { value?: string | null }) {
  if (!value) return <span>Sin actividad reciente</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{value}</span>;
  const minutes = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const label = minutes < 60 ? `Hace ${minutes} min` : hours < 24 ? `Hace ${hours} h` : `Hace ${Math.floor(hours / 24)} d`;
  return <span suppressHydrationWarning>{label}</span>;
}

export function RowLink({ children }: { children: ReactNode }) {
  return <span className="row-link">{children}<ChevronRight size={17} aria-hidden="true" /></span>;
}

export function Metadata({ children }: { children: ReactNode }) {
  return <span className="metadata"><Clock size={13} />{children}</span>;
}

export function Feedback({ message, tone = "success" }: { message?: string | null; tone?: "success" | "error" }) {
  if (!message) return null;
  return (
    <div className={`feedback feedback--${tone}`} role="status">
      {tone === "success" ? <Check size={15} /> : null}
      {message}
    </div>
  );
}

export function announceFeedback(message: string, tone: "success" | "error" = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("martu:feedback", { detail: { message, tone } }));
}
