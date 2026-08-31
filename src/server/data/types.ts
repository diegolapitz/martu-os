import type { DbExecutor } from "@/server/db";

export type Id = string;
export type IsoDateTime = string;

export interface DayPriority {
  id: Id;
  title: string;
  clientName?: string;
  clientSlug?: string;
  dueLabel?: string;
  status?: string;
  entityType?: string;
  entityId?: Id;
  targetPath?: string;
}

export interface AgendaItem {
  id: Id;
  time: string;
  title: string;
  subtitle?: string;
  clientName?: string;
  clientSlug?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  entityType?: string;
  entityId?: Id;
  targetPath?: string;
}

export interface AttentionClient {
  id: Id;
  slug: string;
  name: string;
  reason: string;
  detail?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  targetPath?: string;
}

export interface DayData {
  date: IsoDateTime;
  greeting: string;
  supervisorMessage: string;
  spotlight?: {
    workId: Id;
    clientName?: string;
    clientSlug?: string;
    targetPath: string;
    actionLabel: string;
  } | null;
  priorities: DayPriority[];
  agenda: AgendaItem[];
  clientsNeedingAttention: AttentionClient[];
  stats: { openTasks: number; overdueTasks: number; pendingNudges: number };
}

export interface ClientSummary {
  id: Id;
  slug: string;
  name: string;
  description: string;
  summary?: string;
  status: string;
  services: string[];
  serviceSlugs?: string[];
  accent?: string | null;
  logoUrl?: string | null;
  nextDeadline?: string | null;
  nextDeadlineAt?: IsoDateTime | null;
  attention?: string | null;
  updatedAt?: IsoDateTime | null;
}

export interface WorkspaceTab {
  id: string;
  label: string;
}
export interface DeadlineItem {
  id: Id;
  title: string;
  date: IsoDateTime;
  dateLabel?: string;
  type?: string;
  urgent?: boolean;
  entityType?: string | null;
  entityId?: Id | null;
  targetPath?: string | null;
}
export interface WorkItem {
  id: Id;
  title: string;
  status: string;
  dueLabel?: string;
  entityType?: string;
  entityId?: Id | null;
}
export interface ClientIdea {
  id: Id;
  title: string;
  description: string;
  status: string;
  origin?: string;
  format?: string | null;
  notes?: string | null;
  tags: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  scriptId?: Id | null;
  contentId?: Id | null;
}
export interface ClientScript {
  id: Id;
  ideaId?: Id | null;
  number?: number;
  title: string;
  format: string;
  objective: string;
  hook: string;
  body: string;
  cta: string;
  status: string;
  notes: string;
  version: number;
  updatedAt: IsoDateTime;
  deadline?: IsoDateTime | null;
  contentId?: Id | null;
}
export interface ContentItem {
  id: Id;
  title: string;
  status: string;
  format: string;
  channel: string;
  caption?: string | null;
  cta?: string | null;
  notes?: string | null;
  updatedAt: IsoDateTime;
  deadline?: IsoDateTime | null;
  scriptId?: Id | null;
  ideaId?: Id | null;
  publicationId?: Id | null;
  publishedAt?: IsoDateTime | null;
  pipelinePosition?: number;
}
export interface ClientTask {
  id: Id;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueAt?: IsoDateTime | null;
  dueLabel?: string;
  entityType?: string;
  entityId?: Id | null;
  updatedAt: IsoDateTime;
}
export interface ClientNote {
  id: Id;
  text: string;
  tags: string[];
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface ClientMeeting {
  id: Id;
  title: string;
  date: IsoDateTime;
  duration: string;
  durationMinutes: number;
  summary: string;
  decisions: string[];
  commitments: string[];
  nextSteps: string[];
}
export interface ClientFile {
  id: Id;
  name: string;
  type: string;
  url: string;
  provider: string;
  sizeLabel?: string | null;
  updatedAt: IsoDateTime;
}
export interface MetricItem {
  id: Id;
  contentItemId?: Id | null;
  publicationId?: Id | null;
  contentTitle: string;
  date: IsoDateTime;
  reach: number;
  views: number;
  retention?: number;
  saves: number;
  shares: number;
  comments: number;
  clicks: number;
  inquiries: number;
  conversions: number;
}
export interface MetricSnapshot {
  id: Id;
  periodStart: string;
  periodEnd: string;
  followers?: number;
  reach: number;
  views: number;
  saves: number;
  shares: number;
  comments: number;
  clicks: number;
  inquiries: number;
  conversions: number;
}
export type InsightKind =
  | "observation"
  | "pattern"
  | "hypothesis"
  | "recommendation";
export type InsightSurface = "metrics" | "ads";
export interface InsightItem {
  id: Id;
  kind: InsightKind;
  statement: string;
  evidence: Record<string, unknown>;
  confidence?: number | null;
  source: string;
  surface: InsightSurface;
  contentItemId?: Id | null;
  contentTitle?: string | null;
  publicationId?: Id | null;
  publicationLabel?: string | null;
  campaignId?: Id | null;
  campaignName?: string | null;
  creativeId?: Id | null;
  creativeName?: string | null;
  targetPath?: string | null;
  targetLabel?: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface CampaignItem {
  id: Id;
  name: string;
  objective: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr?: number;
  cpc?: number;
  cpa?: number;
  roas?: number;
  observations: string;
  creatives?: AdCreative[];
}
export interface AdCreative {
  id: Id;
  contentItemId?: Id | null;
  name: string;
  format: string;
  status: string;
  hook: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr?: number;
  cpc?: number;
  conversions: number;
  observations: string;
}
export interface ActivityItem {
  id: Id;
  title: string;
  detail?: string;
  createdAt: IsoDateTime;
  kind: string;
  actor: string;
  entityType?: string | null;
  entityId?: Id | null;
  targetPath?: string | null;
}
export interface BriefData {
  id: Id;
  status: string;
  summary: string;
  objectives: string[];
  audience: string;
  tone: string;
  positioning: string;
  differentiators: string[];
  constraints: string[];
  updatedAt: IsoDateTime;
}
export interface StrategyData {
  id: Id;
  title: string;
  status: string;
  version: number;
  updatedAt: IsoDateTime;
  objectives: string[];
  audience: string;
  tone: string;
  positioning: string;
  pillars: string[];
  hypotheses: string[];
  decisions: string[];
  notes?: string | null;
  aiSuggestions: string[];
}

export interface ClientWorkspaceData {
  client: ClientSummary;
  services: string[];
  tabs: WorkspaceTab[];
  selectedTab: string;
  searchQuery: string;
  summary: {
    deadlines: DeadlineItem[];
    workInProgress: WorkItem[];
    pending: WorkItem[];
    recentNotes: ClientNote[];
    recentMeetings: ClientMeeting[];
    recentContent: ContentItem[];
    insight: string;
  };
  brief: BriefData | null;
  strategy: StrategyData | null;
  ideas: ClientIdea[];
  scripts: ClientScript[];
  content: ContentItem[];
  tasks: ClientTask[];
  notes: ClientNote[];
  meetings: ClientMeeting[];
  files: ClientFile[];
  metrics: MetricItem[];
  metricSnapshots: MetricSnapshot[];
  insights: InsightItem[];
  campaigns: CampaignItem[];
  activity: ActivityItem[];
  workflowStates: Array<{
    id: Id;
    slug: string;
    label: string;
    color?: string;
    position?: number;
    terminalKind?: string | null;
  }>;
}

export interface Nudge {
  id: Id;
  clientId?: Id | null;
  clientSlug?: string | null;
  clientName?: string | null;
  taskId?: Id | null;
  commitmentId?: Id | null;
  reminderId?: Id | null;
  kind: string;
  severity: "low" | "medium" | "high" | "urgent";
  title: string;
  message: string;
  status: "pending" | "delivered" | "seen" | "acted" | "dismissed" | "expired";
  dedupeKey: string;
  deliverAfter: IsoDateTime;
  cooldownUntil?: IsoDateTime | null;
  deliveredAt?: IsoDateTime | null;
  targetPath: string;
  quickActions: Array<{
    id: string;
    label: string;
    payload?: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
  createdAt: IsoDateTime;
}

export interface ChatMessage {
  id: Id;
  threadId: Id;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  mode: "supervisor" | "strategist" | "creative" | "analyst";
  toolName?: string | null;
  toolPayload?: Record<string, unknown> | null;
  actionResult?: Record<string, unknown> | null;
  createdAt: IsoDateTime;
}
export interface ChatThread {
  id: Id;
  clientId?: Id | null;
  clientSlug?: string | null;
  scope: "global" | "client";
  title: string;
  source: string;
  lastMessageAt?: IsoDateTime | null;
  createdAt: IsoDateTime;
  messages: ChatMessage[];
}
export interface Memory {
  id: Id;
  clientId?: Id | null;
  clientSlug?: string | null;
  scope: "global" | "client";
  category: string;
  fact: string;
  importance: number;
  source: string;
  lastUsedAt?: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
export interface CommunicationProfile {
  id: Id;
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
  minorTaskLeadHours: number;
  explicitPreferences: string[];
  updatedAt: IsoDateTime;
}
export interface PushSubscriptionRecord {
  id: Id;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  status: "active" | "expired" | "revoked";
  lastUsedAt?: IsoDateTime | null;
  failureCount: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type TransactionExecutor = DbExecutor;
