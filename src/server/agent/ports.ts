import type {
  AgentActionReceipt,
  AgentContext,
  AgentEntityRef,
  AgentPlanningContext,
  AgentReply,
  AgentRetrievalPlan,
  AgentRequest,
  RequestPlan,
  ResponseDirection,
  AgentSource,
  AgentTurnPlan,
  ClientRef,
  ToolCall,
} from "./types";

export interface AgentMutationContext {
  clientSlug?: string;
  threadId: string;
  source: AgentSource;
  now: Date;
}

export interface ResolvedEntity extends AgentEntityRef {
  status?: string | null;
  dueAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentMutationGateway {
  getClient(slug: string): Promise<ClientRef | undefined>;
  findEntity(input: {
    type: "task" | "script" | "content" | "commitment";
    id?: string;
    clientSlug?: string;
    ordinal?: number;
    query?: string;
  }): Promise<ResolvedEntity | undefined>;
  createTask(input: Record<string, unknown>): Promise<ResolvedEntity>;
  completeEntity(entity: ResolvedEntity): Promise<ResolvedEntity>;
  rescheduleEntity(entity: ResolvedEntity, dueAt: string): Promise<ResolvedEntity>;
  createNote(input: Record<string, unknown>): Promise<ResolvedEntity>;
  createIdea(input: Record<string, unknown>): Promise<ResolvedEntity>;
  createOpenLoop(input: Record<string, unknown>): Promise<ResolvedEntity>;
  createScript(input: Record<string, unknown>): Promise<ResolvedEntity>;
  updateContentStatus(entity: ResolvedEntity, status: string): Promise<ResolvedEntity>;
  createCommitment(input: Record<string, unknown>): Promise<ResolvedEntity>;
  createReminder(input: Record<string, unknown>): Promise<{ id: string }>;
  saveMemory(input: Record<string, unknown>): Promise<{ id: string; content: string }>;
  updateCommunicationProfile(input: Record<string, unknown>): Promise<void>;
  storeUndo(input: {
    type: string;
    entity: ResolvedEntity;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    context: AgentMutationContext;
  }): Promise<string>;
  undo(token: string, context: AgentMutationContext): Promise<AgentActionReceipt | undefined>;
}

export interface AgentConversationStore {
  getOrCreateThread(input: {
    threadId?: string;
    clientSlug?: string;
    title?: string;
    createNew?: boolean;
  }): Promise<string>;
  appendMessage(input: {
    threadId: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    source: AgentSource;
    clientSlug?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  buildContext(input: AgentRequest & {
    threadId: string;
    now: Date;
    signal?: AbortSignal;
    /** Internal, policy-routed one-turn override. Never accepted from HTTP. */
    clientOverride?: string;
    retrievalPlan?: AgentRetrievalPlan;
  }): Promise<AgentContext>;
  /** Optional during migration so lightweight test stores stay compatible. */
  buildPlanningContext?(input: AgentRequest & {
    threadId: string;
    now: Date;
    signal?: AbortSignal;
  }): Promise<AgentPlanningContext>;
}

export interface RequestPlannerInput {
  request: AgentRequest;
  context: AgentPlanningContext;
  signal?: AbortSignal;
}

export interface RequestPlanner {
  plan(input: RequestPlannerInput): Promise<RequestPlan>;
}

export interface ResponseDirector {
  direct(input: { request: AgentRequest; context: AgentContext; plan: AgentTurnPlan; signal?: AbortSignal }): Promise<ResponseDirection>;
}

export interface AgentToolExecutor {
  execute(call: ToolCall, context: AgentMutationContext): Promise<AgentActionReceipt>;
  undo(token: string, context: AgentMutationContext): Promise<AgentActionReceipt | undefined>;
}

export interface AgentModelInput {
  request: AgentRequest;
  context: AgentContext;
  plan: AgentTurnPlan;
  responseDirection?: ResponseDirection;
  mutationContext: AgentMutationContext;
  executeTool: AgentToolExecutor["execute"];
  signal?: AbortSignal;
}

export interface AgentModelResult {
  message: string;
  capability: AgentReply["capability"];
  actions: AgentActionReceipt[];
}

export interface AgentModelProvider {
  readonly mode: AgentReply["mode"];
  generate(input: AgentModelInput): Promise<AgentModelResult>;
}
