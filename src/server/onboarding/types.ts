export const ONBOARDING_STEPS = [
  "welcome",
  "profile",
  "services",
  "client",
  "brief",
  "strategy",
  "complete",
] as const;

export const ONBOARDING_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "skipped",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export type OnboardingState = {
  status: OnboardingStatus;
  step: OnboardingStep;
  completed: OnboardingStep[];
  skipped: OnboardingStep[];
  profileText: string;
  confirmedServiceIds: string[];
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  updatedAt: string;
};

export type FreelancerService = {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  active: boolean;
};

export type OnboardingClient = {
  id: string;
  slug: string;
  name: string;
  color: string;
  logoUrl: string | null;
};

export type OnboardingUserProfile = {
  name: string;
  preferredName: string;
  email: string | null;
  timezone: string;
  avatarUrl: string | null;
  description: string;
};

export type FirstRunStage =
  | "account_ready"
  | "profile_pending"
  | "services_pending"
  | "client_pending"
  | "client_optional"
  | "active";

export type OnboardingBundle = {
  onboarding: OnboardingState;
  user: OnboardingUserProfile;
  firstRun: {
    stage: FirstRunStage;
    minimumReady: boolean;
    nextPath: string;
  };
  services: FreelancerService[];
  clients?: OnboardingClient[];
};

export type SetupItem = {
  id: string;
  label: string;
  complete: boolean;
  optional: boolean;
};

export type ClientSetup = {
  completeness: number;
  complete: string[];
  pending: string[];
  sections: Array<{
    id: "base" | "strategy" | "channels" | "operation";
    label: string;
    items: SetupItem[];
  }>;
  brief: ClientBrief | null;
  strategy: ClientStrategy | null;
  channels: {
    instagram: string | null;
    metaAds: string | null;
    calendarConnected: boolean;
    firstPlanningDone: boolean;
  };
  strategyDeferred: boolean;
  nonBlocking: true;
};

export type ClientBrief = {
  status: "missing" | "draft" | "complete";
  businessDescription: string;
  objectives: string[];
  audience: string;
  differentiators: string[];
  tone: string;
  competitors: string[];
  desiredOutcomes: string[];
  avoidances: string[];
  relevantLinks: string[];
  source: string;
  confirmedAt: string | null;
};

export type ClientStrategy = {
  status: "draft" | "active" | "archived";
  title: string;
  objectives: string[];
  audience: string;
  tone: string;
  positioning: string;
  pillars: string[];
  notes: string;
  sourceType: string;
  sourceUrl: string | null;
  sourceText: string;
  confirmedAt: string | null;
};

export type CreatedClient = {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  logoUrl: string | null;
  serviceIds: string[];
};
