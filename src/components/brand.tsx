import { Bird, Sun } from "lucide-react";

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
  const isGavilan = name.toLocaleLowerCase("es").includes("gavil");
  const imageStyle = logoUrl ? { backgroundImage: `url(${JSON.stringify(logoUrl)})`, backgroundPosition: "center", backgroundSize: "cover" } : {};

  return (
    <span className={large ? "client-mark client-mark--large" : "client-mark"} aria-hidden="true" style={{ ...(accent ? { backgroundColor: accent } : {}), ...imageStyle }}>
      {logoUrl ? null : isGavilan ? <Bird strokeWidth={1.65} /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}
