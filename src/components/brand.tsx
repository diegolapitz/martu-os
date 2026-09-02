import type { CSSProperties } from "react";
import { Sun } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "brand brand--compact" : "brand"} aria-label="Martu OS">
      <span>martu</span>
      <span className="brand__slash" aria-hidden="true">/</span>
      <span>os</span>
    </span>
  );
}

export function SunMark({ size = 28 }: { size?: number }) {
  return <Sun size={size} strokeWidth={1.7} aria-hidden="true" />;
}

export function ClientMark({ name, large = false, logoUrl, accent }: { name: string; large?: boolean; logoUrl?: string | null; accent?: string | null }) {
  const markStyle = {
    ...(accent ? { "--client-accent": accent } : {}),
    ...(logoUrl ? { backgroundImage: `url(${JSON.stringify(logoUrl)})`, backgroundPosition: "center", backgroundSize: "cover" } : {}),
  } as CSSProperties;

  return (
    <span className={`${large ? "client-mark client-mark--large" : "client-mark"}${logoUrl ? " has-logo" : ""}`} aria-hidden="true" style={markStyle}>
      {logoUrl ? null : <span>{clientInitials(name)}</span>}
    </span>
  );
}

function clientInitials(name: string) {
  const normalized = name.trim().toLocaleLowerCase("es");
  const productInitials: Record<string, string> = {
    "metauro": "Me",
    "luma": "Lu",
    "luma estudio": "Lu",
    "casa norte": "CN",
    "brava fit": "BF",
    "nido": "Ni",
  };
  if (productInitials[normalized]) return productInitials[normalized];
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "—";
  if (words.length > 1) return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
  const word = words[0]!;
  return `${word[0] ?? ""}${word[1] ?? ""}`.toLocaleUpperCase("es");
}

export function ClientIdentity({
  name,
  accent,
  logoUrl,
  meta,
  compact = false,
  className = "",
}: {
  name: string;
  accent?: string | null;
  logoUrl?: string | null;
  meta?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`client-identity${compact ? " client-identity--compact" : ""}${className ? ` ${className}` : ""}`}>
      <ClientMark name={name} accent={accent} logoUrl={logoUrl} />
      <span className="client-identity__copy">
        <strong>{name}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
    </span>
  );
}
