import type { FunctionTool } from "openai/resources/responses/responses";

import type { AgentToolName } from "./types";

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };

export const AGENT_TOOL_DEFINITIONS: FunctionTool[] = [
  {
    type: "function",
    name: "create_task",
    description: "Crea una tarea real. Usar cuando Martu pide explícitamente agendar o crear trabajo.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        clientSlug: nullableString,
        title: { type: "string" },
        description: nullableString,
        dueAt: nullableString,
        priority: { type: ["string", "null"], enum: ["low", "medium", "high", "urgent", null] },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "complete_task",
    description: "Marca una tarea, guion, contenido o compromiso existente como resuelto.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["task", "script", "content", "commitment"] },
        targetId: nullableString,
        clientSlug: nullableString,
        ordinal: nullableNumber,
        query: nullableString,
      },
      required: ["targetType"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "change_deadline",
    description: "Reprograma el deadline de una tarea, guion o compromiso existente. No crea un duplicado.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["task", "script", "content", "commitment"] },
        targetId: nullableString,
        clientSlug: nullableString,
        ordinal: nullableNumber,
        query: nullableString,
        dueAt: { type: "string", description: "Fecha ISO-8601 con zona horaria." },
      },
      required: ["targetType", "dueAt"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_note",
    description: "Guarda una nota privada durable en el cliente correcto.",
    strict: false,
    parameters: {
      type: "object",
      properties: { clientSlug: nullableString, body: { type: "string" }, tags: { type: ["array", "null"], items: { type: "string" } } },
      required: ["body"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_idea",
    description: "Crea una idea de contenido en el cliente correcto.",
    strict: false,
    parameters: {
      type: "object",
      properties: { clientSlug: nullableString, title: { type: "string" }, description: nullableString, tags: { type: ["array", "null"], items: { type: "string" } } },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_open_loop",
    description: "Guarda un tema o idea para retomar más adelante, sin inventarle una fecha.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        clientSlug: nullableString,
        title: { type: "string" },
        body: nullableString,
        kind: { type: ["string", "null"], enum: ["idea", "hypothesis", "topic", "later", null] },
        salience: { type: ["number", "null"] },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_script_draft",
    description: "Crea un borrador de guion como documento de trabajo.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        clientSlug: nullableString,
        title: { type: "string" },
        format: nullableString,
        objective: nullableString,
        hook: nullableString,
        body: nullableString,
        cta: nullableString,
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_content_status",
    description: "Cambia el estado de una pieza de contenido existente.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        targetId: nullableString,
        clientSlug: nullableString,
        ordinal: nullableNumber,
        query: nullableString,
        status: { type: "string" },
      },
      required: ["status"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_commitment",
    description: "Registra una promesa accionable de Martu. Todo 'mañana termino...' debe persistirse con esta herramienta.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        clientSlug: nullableString,
        intent: { type: "string" },
        targetType: { type: ["string", "null"], enum: ["task", "script", "content", null] },
        targetId: nullableString,
        ordinal: nullableNumber,
        query: nullableString,
        dueAt: { type: "string" },
        remindAt: nullableString,
      },
      required: ["intent", "dueAt"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "save_memory",
    description: "Guarda sólo una preferencia explícita, decisión o hecho durable; no cada frase del chat.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        clientSlug: nullableString,
        scope: { type: "string", enum: ["global", "client"] },
        category: { type: "string" },
        content: { type: "string" },
        importance: { type: ["number", "null"] },
      },
      required: ["scope", "category", "content"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_communication_profile",
    description: "Actualiza una preferencia explícita sobre tono, insistencia, horarios o recordatorios.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        insistenceLevel: nullableNumber,
        quietHoursStart: nullableString,
        quietHoursEnd: nullableString,
        preferredLength: { type: ["string", "null"], enum: ["short", "medium", "long", null] },
        preferenceKey: nullableString,
        preferenceValue: {},
      },
      additionalProperties: false,
    },
  },
];

export function agentToolDefinitionsFor(names: readonly AgentToolName[]): FunctionTool[] {
  const allowed = new Set<string>(names);
  return AGENT_TOOL_DEFINITIONS.filter((tool) => allowed.has(tool.name));
}
