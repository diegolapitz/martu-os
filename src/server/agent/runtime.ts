import "server-only";

import { NudgeActionService } from "@/server/proactivity/action-service";
import { NaturalNudgeComposer } from "@/server/proactivity/composer";
import { MartuProactivityDataRepository } from "@/server/proactivity/data-repository";
import { DeterministicNudgeDetector } from "@/server/proactivity/detector";
import { ProactivityEngine } from "@/server/proactivity/engine";
import { MartuPushSubscriptionRepository } from "@/server/push/data-repository";
import { PushSubscriptionService } from "@/server/push/subscription-service";
import { WebPushNotificationProvider } from "@/server/push/web-push-provider";

import { AgentActionService } from "./action-service";
import { MartuAgentDataAdapter } from "./data-adapter";
import { DemoAgentProvider } from "./demo-provider";
import { OpenAIResponsesProvider } from "./openai-provider";
import { AgentOrchestrator } from "./orchestrator";
import { DeterministicRequestPlanner, OpenAIRequestPlanner } from "./request-planner";

export interface MartuRuntime {
  agent: AgentOrchestrator;
  actions: AgentActionService;
  nudgeActions: NudgeActionService;
  nudges: MartuProactivityDataRepository;
  proactivity: ProactivityEngine;
  pushSubscriptions: PushSubscriptionService;
}

type RuntimeGlobal = typeof globalThis & { __martuRuntime?: MartuRuntime };
const runtimeGlobal = globalThis as RuntimeGlobal;

export function getMartuRuntime(): MartuRuntime {
  // Next's dev HMR preserves globalThis. Recreate these lightweight adapters
  // in development so code changes and demo DB resets never keep stale class
  // instances; production functions still reuse one runtime per warm process.
  if (process.env.NODE_ENV !== "production") return createRuntime();
  runtimeGlobal.__martuRuntime ??= createRuntime();
  return runtimeGlobal.__martuRuntime;
}

function createRuntime(): MartuRuntime {
  const agentData = new MartuAgentDataAdapter();
  const actions = new AgentActionService(agentData);
  const demo = new DemoAgentProvider();
  const real = process.env.OPENAI_API_KEY ? new OpenAIResponsesProvider() : undefined;
  const planner = process.env.OPENAI_API_KEY ? new OpenAIRequestPlanner() : new DeterministicRequestPlanner();
  const agent = new AgentOrchestrator(agentData, actions, real ?? demo, real ? demo : undefined, planner);
  const pushRepository = new MartuPushSubscriptionRepository();
  const pushSubscriptions = new PushSubscriptionService(pushRepository);
  const webPush = new WebPushNotificationProvider(pushRepository);
  const nudges = new MartuProactivityDataRepository();
  const proactivity = new ProactivityEngine(nudges, new DeterministicNudgeDetector(), new NaturalNudgeComposer(), webPush);
  const nudgeActions = new NudgeActionService(nudges, actions);
  return { agent, actions, nudgeActions, nudges, proactivity, pushSubscriptions };
}
