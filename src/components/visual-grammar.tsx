import {
  Bell,
  CalendarClock,
  ChartNoAxesColumnIncreasing,
  FileText,
  FolderOpen,
  Lightbulb,
  ListTodo,
  Megaphone,
  MessageSquareText,
  NotebookPen,
  Paperclip,
  Video,
} from "lucide-react";

const CLIENT_ACCENTS: Record<string, string> = {
  gavilan: "#4f7157",
  "luma-estudio": "#9a755f",
  luma: "#9a755f",
  "casa-norte": "#a16947",
  "brava-fit": "#a54936",
  brava: "#a54936",
  nido: "#6d6a85",
};

function token(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es")
    .replace(/[\s_/]+/g, "-");
}

export function clientAccent(
  slug?: string | null,
  name?: string | null,
  explicit?: string | null,
) {
  if (explicit && /^#[0-9a-f]{6}$/i.test(explicit)) return explicit;
  const slugToken = token(slug);
  if (CLIENT_ACCENTS[slugToken]) return CLIENT_ACCENTS[slugToken];
  const nameToken = token(name);
  if (CLIENT_ACCENTS[nameToken]) return CLIENT_ACCENTS[nameToken];
  return "#667085";
}

export function objectTypeLabel(value?: string | null) {
  const kind = token(value);
  if (/idea/.test(kind)) return "Idea";
  if (/script|guion/.test(kind)) return "Guion";
  if (/content|contenido|reel|publication|publicacion/.test(kind)) return "Contenido";
  if (/meeting|reunion/.test(kind)) return "Reunión";
  if (/deadline|event|evento|delivery|entrega/.test(kind)) return "Evento";
  if (/metric|metrica|report/.test(kind)) return "Métrica";
  if (/ads|pauta|campaign|campana/.test(kind)) return "Pauta";
  if (/note|nota/.test(kind)) return "Nota";
  if (/reminder|recordatorio|nudge/.test(kind)) return "Recordatorio";
  if (/file|archivo|asset/.test(kind)) return "Archivo";
  return "Tarea";
}

export function ObjectTypeIcon({
  type,
  size = 16,
  className,
}: {
  type?: string | null;
  size?: number;
  className?: string;
}) {
  const label = objectTypeLabel(type);
  const props = { className, size, "aria-label": label, role: "img" } as const;
  if (label === "Idea") return <Lightbulb {...props} />;
  if (label === "Guion") return <FileText {...props} />;
  if (label === "Contenido") return <Video {...props} />;
  if (label === "Reunión") return <MessageSquareText {...props} />;
  if (label === "Evento") return <CalendarClock {...props} />;
  if (label === "Métrica") return <ChartNoAxesColumnIncreasing {...props} />;
  if (label === "Pauta") return <Megaphone {...props} />;
  if (label === "Nota") return <NotebookPen {...props} />;
  if (label === "Recordatorio") return <Bell {...props} />;
  if (label === "Archivo") return <Paperclip {...props} />;
  if (/folder/i.test(type ?? "")) return <FolderOpen {...props} />;
  return <ListTodo {...props} />;
}

export function humanStatus(value?: string | null) {
  const status = token(value);
  if (/complete|completed|done|hecho|published|publicado/.test(status)) return "Completado";
  if (/block|blocked|bloque/.test(status)) return "Bloqueado";
  if (/approval|aprobacion|review/.test(status)) return "En aprobación";
  if (/schedule|scheduled|programado/.test(status)) return "Programado";
  if (/progress|curso|develop/.test(status)) return "En curso";
  if (/waiting|espera/.test(status)) return "En espera";
  return "Pendiente";
}
