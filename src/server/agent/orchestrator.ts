import { routeAgentTurn } from "./intent-router";
import type { AgentConversationStore, AgentModelProvider, AgentModelResult, AgentToolExecutor } from "./ports";
import { authorizeToolCall, evaluateServiceScope, safeToolError } from "./policy";
import {
  contextualNextStepFastPath,
  directResult,
  presentAgentResult,
  readFastPath,
  timeoutResult,
} from "./presenter";
import {
  AGENT_CONTEXT_TIMEOUT_MS,
  AGENT_TURN_TIMEOUT_MS,
  isAgentTimeout,
  withAgentTimeout,
} from "./timeout";
import type {
  AgentActionReceipt,
  AgentContext,
  AgentReply,
  AgentRequest,
  AgentTurnPlan,
  AgentTurnTimings,
} from "./types";

export class AgentOrchestrator {
  constructor(
    private readonly conversations: AgentConversationStore,
    private readonly tools: AgentToolExecutor,
    private readonly primaryProvider: AgentModelProvider,
    private readonly fallbackProvider?: AgentModelProvider,
  ) {}

  async run(request: AgentRequest): Promise<AgentReply> {
    const startedAt = performance.now();
    const timing = {
      routingMs: 0,
      contextMs: 0,
      modelMs: 0,
      toolMs: 0,
      persistenceMs: 0,
      fastPath: false,
      timedOut: false,
    };
    const message = request.message.trim();
    if (!message) throw new Error("El mensaje no puede estar vacío.");
    const now = request.now ?? new Date();
    const source = request.source ?? "web";
    const turnId = request.turnId ?? crypto.randomUUID();

    let phase = performance.now();
    const threadId = await this.conversations.getOrCreateThread({
      threadId: request.threadId,
      clientSlug: request.clientSlug,
      title: message.slice(0, 80),
      createNew: request.createNewThread,
    });
    await this.conversations.appendMessage({
      threadId,
      role: "user",
      content: message,
      source,
      clientSlug: request.clientSlug,
      metadata: {
        ...(request.metadata ?? {}),
        turnId,
        conversationScope: request.contextScope ?? (request.clientSlug ? "client" : "global"),
        conversationContext: request.contextEntity ?? null,
        currentView: request.currentView ?? null,
      },
    });
    timing.persistenceMs += performance.now() - phase;

    phase = performance.now();
    let context: AgentContext;
    try {
      context = await this.buildContextWithDeadline(
        { ...request, message, threadId, turnId, now },
        startedAt,
      );
    } catch (error) {
      timing.contextMs += performance.now() - phase;
      if (isAgentTimeout(error)) {
        timing.timedOut = true;
        return this.timeoutBeforePlan({
          request,
          threadId,
          turnId,
          source,
          startedAt,
          timing,
        });
      }
      throw error;
    }
    timing.contextMs += performance.now() - phase;

    phase = performance.now();
    let plan = routeAgentTurn({ ...request, message, threadId, turnId, now }, context);
    timing.routingMs += performance.now() - phase;

    // A client named in a global conversation scopes only this turn. The thread
    // remains global, while retrieval is rebuilt with the correct services and
    // client memory before any response or mutation is allowed.
    if (plan.clientSlug && context.currentClient?.slug !== plan.clientSlug) {
      phase = performance.now();
      try {
        context = await this.buildContextWithDeadline({
          ...request,
          message,
          threadId,
          turnId,
          clientSlug: plan.clientSlug,
          clientOverride: plan.clientSlug,
          now,
        }, startedAt);
      } catch (error) {
        timing.contextMs += performance.now() - phase;
        if (isAgentTimeout(error)) {
          timing.timedOut = true;
          return this.timeoutBeforePlan({
            request: { ...request, clientSlug: plan.clientSlug },
            threadId,
            turnId,
            source,
            startedAt,
            timing,
            intent: plan.intent,
          });
        }
        throw error;
      }
      timing.contextMs += performance.now() - phase;
      phase = performance.now();
      plan = routeAgentTurn({ ...request, message, threadId, turnId, clientSlug: plan.clientSlug, now }, context);
      timing.routingMs += performance.now() - phase;
    }

    const serviceScope = evaluateServiceScope(plan, context);
    const mutationContext = {
      threadId,
      clientSlug: plan.clientSlug ?? context.currentClient?.slug ?? request.clientSlug,
      source,
      now,
    };
    const executedActions: AgentActionReceipt[] = [];
    let mutationInFlight = false;
    const executeTool: AgentToolExecutor["execute"] = async (call, toolContext) => {
      if (executedActions.length >= plan.maxWrites) throw new Error("Este turno ya ejecutó su única acción permitida.");
      const authorized = authorizeToolCall(plan, context, call);
      mutationInFlight = true;
      const toolStarted = performance.now();
      try {
        const receipt = await this.tools.execute(authorized, toolContext);
        executedActions.push(receipt);
        return receipt;
      } finally {
        timing.toolMs += performance.now() - toolStarted;
        mutationInFlight = false;
      }
    };

    let provider = this.primaryProvider;
    let generated: AgentModelResult;

    if (plan.requiresClarification) {
      timing.fastPath = true;
      generated = directResult(plan.clarification ?? "¿Me aclarás qué querés cambiar?", plan);
    } else if (!serviceScope.allowed) {
      timing.fastPath = true;
      generated = directResult(serviceScope.message ?? "Ese servicio no está activo para este cliente.", plan);
    } else if (plan.operation === "undo") {
      timing.fastPath = true;
      generated = await this.undoLastAction(plan, context, mutationContext, timing, executedActions);
    } else {
      const readResult = readFastPath(plan, context);
      const contextualResult = contextualNextStepFastPath(plan, context, message);
      if (readResult || contextualResult) {
        timing.fastPath = true;
        generated = readResult ?? contextualResult!;
      } else if (plan.directToolCall) {
        timing.fastPath = true;
        generated = await this.executePlannedTool(plan, plan.directToolCall, mutationContext, executeTool);
      } else {
        const beforeModelTools = timing.toolMs;
        const modelStarted = performance.now();
        try {
          generated = await this.generateWithDeadline(provider, request, message, threadId, turnId, now, context, plan, mutationContext, executeTool, startedAt, () => mutationInFlight);
        } catch (error) {
          if (executedActions.length) {
            generated = directResult("", plan, executedActions);
          } else if (isAgentTimeout(error)) {
            timing.timedOut = true;
            generated = timeoutResult(plan);
          } else if (this.fallbackProvider && this.fallbackProvider !== provider) {
            provider = this.fallbackProvider;
            try {
              generated = await this.generateWithDeadline(provider, request, message, threadId, turnId, now, context, plan, mutationContext, executeTool, startedAt, () => mutationInFlight);
            } catch (fallbackError) {
              if (executedActions.length) generated = directResult("", plan, executedActions);
              else if (isAgentTimeout(fallbackError)) {
                timing.timedOut = true;
                generated = timeoutResult(plan);
              } else throw fallbackError;
            }
          } else throw error;
        }
        timing.modelMs += Math.max(0, performance.now() - modelStarted - (timing.toolMs - beforeModelTools));
      }
    }

    generated = presentAgentResult(plan, {
      ...generated,
      // Receipts are trusted only when they came back through the policy-
      // guarded executor. Model text can never manufacture a visible action.
      actions: executedActions,
    });

    phase = performance.now();
    await this.conversations.appendMessage({
      threadId,
      role: "assistant",
      content: generated.message,
      source,
      clientSlug: plan.clientSlug ?? context.currentClient?.slug ?? request.clientSlug,
      metadata: {
        mode: provider.mode,
        capability: generated.capability,
        intent: plan.intent,
        actions: generated.actions,
        turnId,
        conversationScope: context.conversationScope,
        conversationContext: context.conversationEntity ?? null,
        currentView: context.currentView ?? null,
      },
    });
    timing.persistenceMs += performance.now() - phase;

    const finalTimings: AgentTurnTimings = {
      totalMs: rounded(performance.now() - startedAt),
      routingMs: rounded(timing.routingMs),
      contextMs: rounded(timing.contextMs),
      modelMs: rounded(timing.modelMs),
      toolMs: rounded(timing.toolMs),
      persistenceMs: rounded(timing.persistenceMs),
      fastPath: timing.fastPath,
      timedOut: timing.timedOut,
    };
    const action = generated.actions[0];
    return {
      mode: provider.mode,
      message: generated.message,
      capability: generated.capability,
      threadId,
      action,
      actions: generated.actions,
      undoToken: action?.undoToken,
      clientSlug: plan.clientSlug ?? context.currentClient?.slug ?? request.clientSlug,
      intent: plan.intent,
      turnId,
      timings: finalTimings,
    };
  }

  private async executePlannedTool(
    plan: AgentTurnPlan,
    planned: NonNullable<AgentTurnPlan["directToolCall"]>,
    mutationContext: Parameters<AgentToolExecutor["execute"]>[1],
    executeTool: AgentToolExecutor["execute"],
  ): Promise<AgentModelResult> {
    try {
      const receipt = await executeTool({ callId: `turn-${crypto.randomUUID()}`, ...planned }, mutationContext);
      return directResult("", plan, [receipt]);
    } catch (error) {
      return directResult(safeToolError(error), plan);
    }
  }

  private async undoLastAction(
    plan: AgentTurnPlan,
    context: AgentContext,
    mutationContext: Parameters<AgentToolExecutor["undo"]>[1],
    timing: { toolMs: number },
    actions: AgentActionReceipt[],
  ): Promise<AgentModelResult> {
    if (!context.lastUndoToken) return directResult("No encontré un cambio reciente para deshacer.", plan);
    const started = performance.now();
    try {
      const receipt = await this.tools.undo(context.lastUndoToken, mutationContext);
      if (!receipt) return directResult("Ese cambio ya no se puede deshacer.", plan);
      actions.push(receipt);
      return directResult("", plan, [receipt]);
    } finally {
      timing.toolMs += performance.now() - started;
    }
  }

  private generateWithDeadline(
    provider: AgentModelProvider,
    request: AgentRequest,
    message: string,
    threadId: string,
    turnId: string,
    now: Date,
    context: AgentContext,
    plan: AgentTurnPlan,
    mutationContext: Parameters<AgentToolExecutor["execute"]>[1],
    executeTool: AgentToolExecutor["execute"],
    startedAt: number,
    isMutationInFlight: () => boolean,
  ): Promise<AgentModelResult> {
    const remaining = Math.max(1, AGENT_TURN_TIMEOUT_MS - (performance.now() - startedAt));
    return withAgentTimeout((signal) => provider.generate({
      request: { ...request, message, threadId, turnId, now },
      context,
      plan,
      mutationContext,
      executeTool,
      signal,
    }), remaining, isMutationInFlight);
  }

  private buildContextWithDeadline(
    input: Parameters<AgentConversationStore["buildContext"]>[0],
    startedAt: number,
  ): Promise<AgentContext> {
    const remaining = Math.max(
      1,
      Math.min(
        AGENT_CONTEXT_TIMEOUT_MS,
        AGENT_TURN_TIMEOUT_MS - (performance.now() - startedAt),
      ),
    );
    return withAgentTimeout(
      (signal) => this.conversations.buildContext({ ...input, signal }),
      remaining,
      () => false,
    );
  }

  private async timeoutBeforePlan(input: {
    request: AgentRequest;
    threadId: string;
    turnId: string;
    source: NonNullable<AgentRequest["source"]>;
    startedAt: number;
    timing: {
      routingMs: number;
      contextMs: number;
      modelMs: number;
      toolMs: number;
      persistenceMs: number;
      fastPath: boolean;
      timedOut: boolean;
    };
    intent?: AgentTurnPlan["intent"];
  }): Promise<AgentReply> {
    const message = "Me demoré más de lo razonable. Probá de nuevo en un toque; no cambié nada.";
    const intent = input.intent ?? "AMBIGUOUS";
    const persistenceStarted = performance.now();
    await this.conversations.appendMessage({
      threadId: input.threadId,
      role: "assistant",
      content: message,
      source: input.source,
      clientSlug: input.request.clientSlug,
      metadata: {
        mode: this.primaryProvider.mode,
        capability: "supervisor",
        intent,
        actions: [],
        turnId: input.turnId,
        timedOut: true,
        conversationScope: input.request.contextScope ?? (input.request.clientSlug ? "client" : "global"),
        conversationContext: input.request.contextEntity ?? null,
        currentView: input.request.currentView ?? null,
      },
    });
    input.timing.persistenceMs += performance.now() - persistenceStarted;

    return {
      mode: this.primaryProvider.mode,
      message,
      capability: "supervisor",
      threadId: input.threadId,
      actions: [],
      clientSlug: input.request.clientSlug,
      intent,
      turnId: input.turnId,
      timings: {
        totalMs: rounded(performance.now() - input.startedAt),
        routingMs: rounded(input.timing.routingMs),
        contextMs: rounded(input.timing.contextMs),
        modelMs: rounded(input.timing.modelMs),
        toolMs: rounded(input.timing.toolMs),
        persistenceMs: rounded(input.timing.persistenceMs),
        fastPath: input.timing.fastPath,
        timedOut: true,
      },
    };
  }
}

function rounded(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}
