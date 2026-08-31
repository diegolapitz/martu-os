export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export type DayPriority = {
  id: string;
  title: string;
  clientName?: string;
  clientSlug?: string;
  dueLabel?: string;
  status?: string;
  entityType?: string;
  entityId?: string;
  targetPath?: string;
};

export type AgendaItem = {
  id: string;
  time: string;
  title: string;
  subtitle?: string;
  clientName?: string;
  clientSlug?: string;
  tone?: StatusTone;
  entityType?: string;
  entityId?: string;
  targetPath?: string;
};

export type AttentionClient = {
  id: string;
  slug: string;
  name: string;
  reason: string;
  detail?: string;
  tone?: StatusTone;
  targetPath?: string;
};

export type DayData = {
  date: string;
  greeting: string;
  supervisorMessage: string;
  spotlight?: {
    workId: string;
    clientName?: string;
    clientSlug?: string;
    targetPath: string;
    actionLabel: string;
  } | null;
  priorities: DayPriority[];
  agenda: AgendaItem[];
  clientsNeedingAttention: AttentionClient[];
  stats?: Record<string, number>;
};

export type ClientSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  summary?: string;
  status: string;
  services: string[];
  serviceSlugs?: string[];
  accent?: string | null;
  avatarInitial?: string | null;
  logoUrl?: string | null;
  nextDeadline?: string | null;
  nextDeadlineAt?: string | null;
  attention?: string | null;
  updatedAt?: string | null;
};

export type WorkspaceTab = {
  id: string;
  label: string;
};

export type DeadlineItem = {
  id: string;
  title: string;
  date: string;
  dateLabel?: string;
  type?: string;
  urgent?: boolean;
  entityType?: string | null;
  entityId?: string | null;
  targetPath?: string | null;
};

export type WorkItem = {
  id: string;
  title: string;
  status: string;
  dueLabel?: string;
  entityType?: string;
  entityId?: string;
};

export type ClientIdea = {
  id: string;
  title: string;
  description: string;
  status: string;
  origin?: string;
  format?: string | null;
  notes?: string | null;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  scriptId?: string | null;
  contentId?: string | null;
};

export type ClientScript = {
  id: string;
  ideaId?: string | null;
  number?: number;
  title: string;
  format?: string;
  objective?: string;
  hook: string;
  body: string;
  cta: string;
  status: string;
  notes?: string;
  version?: number | string;
  updatedAt: string;
  deadline?: string | null;
  contentId?: string | null;
};

export type ContentItem = {
  id: string;
  title: string;
  status: string;
  format?: string;
  channel?: string;
  caption?: string | null;
  cta?: string | null;
  notes?: string | null;
  updatedAt?: string;
  deadline?: string | null;
  ideaId?: string | null;
  scriptId?: string | null;
  publicationId?: string | null;
  publishedAt?: string | null;
  pipelinePosition?: number;
};

export type ClientNote = {
  id: string;
  text: string;
  tags?: string[];
  createdAt: string;
};

export type ClientMeeting = {
  id: string;
  title?: string;
  date: string;
  duration?: string;
  summary: string;
  decisions?: string[];
  commitments?: string[];
  nextSteps?: string[];
};

export type ClientFile = {
  id: string;
  name: string;
  type?: string;
  url?: string;
  updatedAt?: string;
};

export type MetricItem = {
  id: string;
  contentItemId?: string | null;
  publicationId?: string | null;
  contentTitle?: string;
  date?: string;
  reach?: number;
  views?: number;
  retention?: number;
  saves?: number;
  shares?: number;
  comments?: number;
  clicks?: number;
  inquiries?: number;
  conversions?: number;
};

export type InsightKind =
  | "observation"
  | "pattern"
  | "hypothesis"
  | "recommendation";

export type InsightSurface = "metrics" | "ads";

export type InsightItem = {
  id: string;
  kind: InsightKind;
  statement: string;
  evidence: Record<string, unknown>;
  confidence?: number | null;
  source: string;
  surface: InsightSurface;
  contentItemId?: string | null;
  contentTitle?: string | null;
  publicationId?: string | null;
  publicationLabel?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  creativeId?: string | null;
  creativeName?: string | null;
  targetPath?: string | null;
  targetLabel?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignItem = {
  id: string;
  name: string;
  status: string;
  spend?: number;
  ctr?: number;
  cpc?: number;
  cpa?: number;
  roas?: number;
  observations?: string;
  creatives?: Array<{
    id: string;
    name: string;
    status: string;
    format?: string;
    contentItemId?: string | null;
    spend?: number;
    ctr?: number;
    cpc?: number;
    conversions?: number;
  }>;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail?: string;
  createdAt: string;
  kind?: string;
  entityType?: string | null;
  entityId?: string | null;
  targetPath?: string | null;
};

export type StrategyData = {
  id?: string;
  title?: string;
  status?: string;
  version?: number | string;
  updatedAt?: string;
  objectives?: string[];
  audience?: string;
  tone?: string;
  positioning?: string;
  pillars?: string[];
  hypotheses?: string[];
  decisions?: string[];
  notes?: string | null;
  aiSuggestions?: string[];
};

export type BriefData = {
  status?: string;
  summary?: string;
  audience?: string;
  differentiators?: string[];
  constraints?: string[];
};

export type ClientWorkspaceData = {
  client: ClientSummary;
  services: string[];
  tabs: WorkspaceTab[] | string[];
  selectedTab?: string;
  summary?: {
    deadlines?: DeadlineItem[];
    workInProgress?: WorkItem[];
    insight?: string;
  };
  brief?: BriefData | null;
  strategy?: StrategyData | null;
  ideas: ClientIdea[];
  scripts: ClientScript[];
  content: ContentItem[];
  tasks: WorkItem[];
  notes: ClientNote[];
  meetings: ClientMeeting[];
  files: ClientFile[];
  metrics: MetricItem[];
  insights: InsightItem[];
  campaigns: CampaignItem[];
  activity: ActivityItem[];
  workflowStates?: Array<{
    id: string;
    slug: string;
    label: string;
    color?: string;
    position?: number;
    terminalKind?: string | null;
  }>;
};
