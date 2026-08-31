import { z } from "zod";

import { jsonError, jsonOk, readJson } from "@/server/agent/http";
import { getMartuRuntime } from "@/server/agent/runtime";
import type { AgentRequest } from "@/server/agent/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(12_000),
  clientSlug: z.string().trim().min(1).max(100).nullable().optional(),
  pathname: z.string().trim().max(500).optional(),
  path: z.string().trim().max(500).optional(),
  threadId: z.union([z.string(), z.number()]).transform(String).optional(),
  createNewThread: z.boolean().optional(),
  turnId: z.string().trim().min(1).max(100).optional(),
  contextScope: z.enum(["global", "client"]).optional(),
  contextEntity: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    type: z.enum(["task", "script", "content", "commitment", "note", "idea", "open_loop", "meeting"]),
    title: z.string().trim().min(1).max(300),
    clientId: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
    clientSlug: z.string().trim().min(1).max(100).nullable().optional(),
  }).optional(),
  currentView: z.object({
    pathname: z.string().trim().min(1).max(500),
    section: z.string().trim().max(100).nullable().optional(),
    clientId: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
    clientSlug: z.string().trim().min(1).max(100).nullable().optional(),
    clientName: z.string().trim().min(1).max(200).nullable().optional(),
    entityType: z.enum(["task", "script", "content", "commitment", "note", "idea", "open_loop", "meeting"]).nullable().optional(),
    entityId: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
    entityTitle: z.string().trim().min(1).max(300).nullable().optional(),
  }).optional(),
  nudgeId: z.union([z.string(), z.number()]).transform(String).optional(),
  source: z.enum(["web", "audio", "quick-capture"]).default("web"),
}).transform((body) => ({
  message: body.message,
  clientSlug: body.clientSlug ?? undefined,
  pathname: body.pathname ?? body.path,
  threadId: body.threadId,
  createNewThread: body.createNewThread,
  turnId: body.turnId,
  contextScope: body.contextScope,
  contextEntity: body.contextEntity ? {
    ...body.contextEntity,
    clientId: body.contextEntity.clientId ?? undefined,
    clientSlug: body.contextEntity.clientSlug ?? undefined,
  } : undefined,
  currentView: body.currentView ? {
    ...body.currentView,
    section: body.currentView.section ?? undefined,
    clientId: body.currentView.clientId ?? undefined,
    clientSlug: body.currentView.clientSlug ?? undefined,
    clientName: body.currentView.clientName ?? undefined,
    entityType: body.currentView.entityType ?? undefined,
    entityId: body.currentView.entityId ?? undefined,
    entityTitle: body.currentView.entityTitle ?? undefined,
  } : undefined,
  nudgeId: body.nudgeId,
  source: body.source === "audio" ? "audio" as const : "web" as const,
  metadata: body.source === "quick-capture" ? { surface: "quick_capture" } : undefined,
}));

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await readJson(request));
    const { nudgeId, ...parsedRequest } = body;
    const agentRequest: AgentRequest = parsedRequest;
    const runtime = getMartuRuntime();
    if (nudgeId) {
      const nudge = await runtime.nudges.getNudge(nudgeId);
      if (!nudge) throw new Error("No encontré la notificación que querías resolver.");
      agentRequest.clientSlug = nudge.clientSlug ?? agentRequest.clientSlug;
      agentRequest.metadata = {
        ...(agentRequest.metadata ?? {}),
        notificationContext: {
          nudgeId: nudge.id,
          entityId: nudge.entityId,
          entityType: nudge.entityType,
          title: nudge.title,
          clientSlug: nudge.clientSlug,
        },
      };
    }
    const reply = await runtime.agent.run(agentRequest);
    const timings = reply.timings;
    const serverTiming = timings
      ? `routing;dur=${timings.routingMs}, context;dur=${timings.contextMs}, model;dur=${timings.modelMs}, tools;dur=${timings.toolMs}, total;dur=${timings.totalMs}`
      : undefined;
    return jsonOk(reply, serverTiming ? { headers: { "server-timing": serverTiming } } : undefined);
  } catch (error) {
    return jsonError(error);
  }
}
