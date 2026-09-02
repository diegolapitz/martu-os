import type { AgentIntent, AgentRequest, AgentToolName } from "../types";

export interface AgentGoldenScenario {
  id: "read" | "ambiguous" | "contextual_action" | "memory" | "scope" | "current_view" | "reference" | "human" | "creative" | "open_loop" | "preference" | "undo";
  request: AgentRequest;
  expectedIntent: AgentIntent;
  expectedTool?: AgentToolName;
  maximumWrites: number;
  maximumWords: number;
}

export const AGENT_GOLDEN_SCENARIOS: AgentGoldenScenario[] = [
  {
    id: "read",
    request: { message: "¿Qué tengo que cerrar hoy de Gavilán?" },
    expectedIntent: "READ",
    maximumWrites: 0,
    maximumWords: 80,
  },
  {
    id: "ambiguous",
    request: { message: "Pasalo al viernes." },
    expectedIntent: "AMBIGUOUS",
    maximumWrites: 0,
    maximumWords: 30,
  },
  {
    id: "contextual_action",
    request: {
      message: "Pasalo al viernes.",
      clientSlug: "gavilan",
      contextEntity: { id: "script-3", type: "script", title: "Guion 3 · Escapadita", clientSlug: "gavilan" },
    },
    expectedIntent: "ACTION",
    expectedTool: "change_deadline",
    maximumWrites: 1,
    maximumWords: 45,
  },
  {
    id: "memory",
    request: { message: "A Gavilán no le gustan los videos institucionales. Acordate." },
    expectedIntent: "MEMORY",
    expectedTool: "save_memory",
    maximumWrites: 1,
    maximumWords: 30,
  },
  {
    id: "scope",
    request: { message: "¿Cómo viene el ROAS de Luma?" },
    expectedIntent: "ANALYSIS",
    maximumWrites: 0,
    maximumWords: 45,
  },
  {
    id: "current_view",
    request: {
      message: "No sé cómo seguir con esto.",
      clientSlug: "gavilan",
      currentView: {
        pathname: "/clients/gavilan/ideas/idea-7",
        section: "ideas",
        clientSlug: "gavilan",
        clientName: "Gavilán",
        entityType: "idea",
        entityId: "idea-7",
        entityTitle: "Serie de microhistorias behind the scenes",
      },
    },
    expectedIntent: "CREATIVE_CHAT",
    maximumWrites: 0,
    maximumWords: 60,
  },
  {
    id: "reference",
    request: {
      message: "Ya está, lo terminé.",
      clientSlug: "gavilan",
      contextEntity: { id: "script-3", type: "script", title: "Guion 3 · Escapadita", clientSlug: "gavilan" },
    },
    expectedIntent: "ACTION",
    expectedTool: "complete_task",
    maximumWrites: 1,
    maximumWords: 35,
  },
  {
    id: "human",
    request: { message: "No llego ni en pedo hoy.", clientSlug: "gavilan" },
    expectedIntent: "CREATIVE_CHAT",
    maximumWrites: 0,
    maximumWords: 60,
  },
  {
    id: "creative",
    request: { message: "Este arranque no me convence. Yo empezaría directo con la escapadita. ¿Vos qué pensás?", clientSlug: "gavilan" },
    expectedIntent: "CREATIVE_CHAT",
    maximumWrites: 0,
    maximumWords: 100,
  },
  {
    id: "open_loop",
    request: { message: "Se me ocurrió una serie documental del detrás de escena. Después la vemos." },
    expectedIntent: "OPEN_LOOP",
    expectedTool: "create_open_loop",
    maximumWrites: 1,
    maximumWords: 40,
  },
  {
    id: "preference",
    request: { message: "No me jodas más con esto." },
    expectedIntent: "MEMORY",
    expectedTool: "update_communication_profile",
    maximumWrites: 1,
    maximumWords: 30,
  },
  {
    id: "undo",
    request: { message: "No, deshacelo.", clientSlug: "gavilan" },
    expectedIntent: "ACTION",
    maximumWrites: 1,
    maximumWords: 35,
  },
];

export const FORBIDDEN_AGENT_OUTPUT = /\b(?:client_slug|clientSlug|client_id|dueAt|pending|in_progress|CONTEXTO RECUPERADO|create_task|change_deadline|save_memory|tool_choice)\b|\bid\s*[:=#]/i;
