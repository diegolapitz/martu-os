export const MARTU_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type AgentCapability = "supervisor" | "strategist" | "creative" | "analyst";
export type AgentRuntimeMode = "demo" | "real";
export type AgentSource = "web" | "audio" | "system" | "whatsapp_future";

export const AGENT_INTENTS = [
  "READ",
  "ACTION",
  "CAPTURE",
  "MEMORY",
  "COMMITMENT",
  "OPEN_LOOP",
  "IDEA",
  "CREATIVE_CHAT",
  "ANALYSIS",
  "AMBIGUOUS",
] as const;

export type AgentIntent = (typeof AGENT_INTENTS)[number];

export interface ClientRef {
  id: string;
  slug: string;
  name: string;
  services?: string[];
}

export interface AgentEntityRef {
  id: string;
  type: "task" | "script" | "content" | "commitment" | "note" | "idea" | "open_loop" | "meeting";
  title: string;
  clientId?: string | null;
  clientSlug?: string | null;
}

export interface AgentContextItem extends AgentEntityRef {
  status?: string | null;
  dueAt?: string | null;
  updatedAt?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentCurrentView {
  pathname: string;
  section?: string | null;
  clientId?: string | null;
  clientSlug?: string | null;
  clientName?: string | null;
  entityType?: AgentEntityRef["type"] | null;
  entityId?: string | null;
  entityTitle?: string | null;
}

export interface AgentMemory {
  id: string;
  scope: "global" | "client";
  category: string;
  content: string;
  importance: number;
  clientId?: string | null;
}

export interface CommunicationProfile {
  language: string;
  formality: number;
  preferredLength: "short" | "medium" | "long";
  humor: number;
  insistenceLevel: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  morningBriefingAt: string;
  morningBriefingEnabled: boolean;
  middayCheckAt: string;
  middayCheckEnabled: boolean;
  endOfDayAt?: string | null;
  endOfDayEnabled: boolean;
  expressions: string[];
  preferences: Record<string, unknown>;
}

export interface RecentChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentContext {
  now: string;
  clients: ClientRef[];
  currentClient?: ClientRef;
  conversationScope?: "global" | "client";
  conversationClient?: ClientRef;
  conversationEntity?: AgentEntityRef;
  currentView?: AgentCurrentView;
  currentViewItem?: AgentContextItem;
  tasks: AgentContextItem[];
  scripts: AgentContextItem[];
  content: AgentContextItem[];
  notes: AgentContextItem[];
  meetings: AgentContextItem[];
  metrics: Array<Record<string, unknown>>;
  campaigns: Array<Record<string, unknown>>;
  memories: AgentMemory[];
  profile: CommunicationProfile;
  recentMessages: RecentChatMessage[];
  lastReferencedEntity?: AgentEntityRef;
  lastUndoToken?: string;
  summary?: string;
}

/**
 * Contexto mínimo y seguro para comprender un pedido antes de consultar el
 * trabajo del cliente. No contiene una carga masiva de retrieval.
 */
export interface AgentPlanningContext {
  now: string;
  clients: ClientRef[];
  conversationScope?: "global" | "client";
  conversationClient?: ClientRef;
  conversationEntity?: AgentEntityRef;
  currentView?: AgentCurrentView;
  currentViewItem?: AgentContextItem;
  recentMessages: RecentChatMessage[];
  lastReferencedEntity?: AgentEntityRef;
}

export const REQUEST_JOBS = [
  "orient",
  "prepare_interaction",
  "recall",
  "prioritize",
  "create",
  "review",
  "analyze",
  "plan",
  "modify",
  "capture",
  "follow_up",
  "reflect",
  "converse",
] as const;

export type RequestJob = (typeof REQUEST_JOBS)[number];
export type RequestScope = "global" | "client" | "entity" | "unknown";
export type RequestTimeHorizon = "now" | "today" | "upcoming" | "past" | "range" | "unspecified";
export type AgentKnowledgeSource = "work" | "scripts" | "content" | "notes" | "meetings" | "memories" | "metrics" | "campaigns" | "profile" | "thread";

/** Semantic understanding of a turn. It deliberately does not authorize a tool. */
export interface RequestPlan {
  job: RequestJob;
  scope: RequestScope;
  clientSlug?: string;
  relevantEntities: Array<{ type?: AgentEntityRef["type"]; title: string; id?: string }>;
  timeHorizon: { kind: RequestTimeHorizon; detail?: string };
  informationNeeds: AgentKnowledgeSource[];
  ambiguities: string[];
  requiresClarification: boolean;
  sideEffectsExplicitlyRequested: boolean;
  response: {
    type: "answer" | "briefing" | "decision_support" | "draft" | "review" | "analysis" | "confirmation";
    depth: "short" | "medium" | "deep";
  };
}

/** The retrieval layer converts semantic needs into this bounded read plan. */
export interface AgentRetrievalPlan {
  sources: AgentKnowledgeSource[];
  scope: RequestScope;
  clientSlug?: string;
}

export interface ResponseDirection {
  conclusion: string;
  depth: "short" | "medium" | "deep";
  tone: "direct" | "warm" | "focused" | "reflective";
  maxWords: number;
  structure: "paragraph" | "briefing" | "bullets" | "question";
  evidence: string[];
  offerNextAction: boolean;
}

export interface AgentRequest {
  message: string;
  clientSlug?: string;
  pathname?: string;
  threadId?: string;
  createNewThread?: boolean;
  turnId?: string;
  contextScope?: "global" | "client";
  contextEntity?: AgentEntityRef;
  currentView?: AgentCurrentView;
  source?: AgentSource;
  now?: Date;
  metadata?: Record<string, unknown>;
}

export type AgentOperation =
  | "read_work"
  | "read_general"
  | "reschedule"
  | "complete"
  | "undo"
  | "create_task"
  | "capture_note"
  | "save_memory"
  | "update_communication_profile"
  | "create_commitment"
  | "create_open_loop"
  | "create_idea"
  | "create_script"
  | "update_content_status"
  | "creative_feedback"
  | "analysis"
  | "conversation"
  | "clarify";

export interface PlannedToolCall {
  name: AgentToolName;
  arguments: Record<string, unknown>;
}

export interface AgentTurnPlan {
  intent: AgentIntent;
  operation: AgentOperation;
  clientSlug?: string;
  entity?: AgentEntityRef;
  allowedTools: AgentToolName[];
  maxWrites: number;
  maxWords: number;
  requiresClarification: boolean;
  clarification?: string;
  directToolCall?: PlannedToolCall;
  requiredServices?: string[];
  serviceLabel?: string;
  requestPlan?: RequestPlan;
  retrievalPlan?: AgentRetrievalPlan;
}

export interface AgentTurnTimings {
  totalMs: number;
  routingMs: number;
  contextMs: number;
  modelMs: number;
  directorMs: number;
  toolMs: number;
  persistenceMs: number;
  fastPath: boolean;
  timedOut: boolean;
}

export interface AgentActionReceipt {
  type: string;
  summary: string;
  entity?: AgentEntityRef;
  undoToken?: string;
  data?: Record<string, unknown>;
}

export interface AgentReply {
  mode: AgentRuntimeMode;
  message: string;
  capability: AgentCapability;
  threadId: string;
  action?: AgentActionReceipt;
  actions?: AgentActionReceipt[];
  undoToken?: string;
  clientSlug?: string;
  intent?: AgentIntent;
  turnId?: string;
  timings?: AgentTurnTimings;
}

export interface ToolCall {
  callId: string;
  name: AgentToolName;
  arguments: Record<string, unknown>;
}

export const AGENT_TOOL_NAMES = [
  "create_task",
  "complete_task",
  "change_deadline",
  "create_note",
  "create_idea",
  "create_open_loop",
  "create_script_draft",
  "update_content_status",
  "create_commitment",
  "save_memory",
  "update_communication_profile",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export function isAgentToolName(value: string): value is AgentToolName {
  return (AGENT_TOOL_NAMES as readonly string[]).includes(value);
}
