import type { AgentRetrievalPlan, AgentTurnPlan, RequestPlan } from "./types";

/** Keeps retrieval separate from language understanding and bounded by need. */
export function planRetrieval(requestPlan: RequestPlan, turnPlan: AgentTurnPlan): AgentRetrievalPlan {
  const sources = new Set(requestPlan.informationNeeds);
  // Thread and profile are cheap context, not an invitation to retrieve all work.
  sources.add("thread");
  sources.add("profile");
  if (turnPlan.operation === "undo") sources.add("thread");
  return {
    sources: [...sources],
    scope: requestPlan.scope,
    clientSlug: turnPlan.clientSlug ?? requestPlan.clientSlug,
  };
}
