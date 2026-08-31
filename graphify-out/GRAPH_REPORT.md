# Graph Report - src/server/proactivity  (2026-08-29)

## Corpus Check
- Corpus is ~5,929 words - fits in a single context window. You may not need a graph.

## Summary
- 108 nodes · 252 edges · 10 communities (7 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Engine and Repository Ports
- Deterministic Nudge Detection
- Nudge Composition and Types
- Nudge Action Lifecycle
- Snapshot Data Mapping
- Delivery State Persistence
- Nudge Record Mapping
- Engine Regression Tests
- Cron Authorization
- Claim Deduplication

## God Nodes (most connected - your core abstractions)
1. `PersistedNudge` - 19 edges
2. `MartuProactivityDataRepository` - 17 edges
3. `ProactivitySnapshot` - 14 edges
4. `ProactivityRepository` - 12 edges
5. `mapNudge()` - 11 edges
6. `NudgeCandidate` - 11 edges
7. `martuUserId()` - 10 edges
8. `ComposedNudge` - 8 edges
9. `NudgeActionGateway` - 7 edges
10. `NudgeComposer` - 6 edges

## Surprising Connections (you probably didn't know these)
- `MartuProactivityDataRepository` --implements--> `NudgeActionGateway`  [EXTRACTED]
  data-repository.ts → action-service.ts
- `MartuProactivityDataRepository` --implements--> `ProactivityRepository`  [EXTRACTED]
  data-repository.ts → ports.ts
- `NaturalNudgeComposer` --implements--> `NudgeComposer`  [EXTRACTED]
  composer.ts → ports.ts
- `workCandidate()` --references--> `NudgeKind`  [EXTRACTED]
  detector.ts → types.ts

## Import Cycles
- None detected.

## Communities (10 total, 3 thin omitted)

### Community 0 - "Engine and Repository Ports"
Cohesion: 0.18
Nodes (8): messageOf(), ProactivityEngine, NudgeDetector, ProactivityNotificationProvider, ProactivityRepository, isQuietTime(), toMinutes(), ProactivityTickResult

### Community 1 - "Deterministic Nudge Detection"
Cohesion: 0.20
Nodes (15): ACTIVE_CONTENT_STATUSES, applyInsistenceProfile(), asDate(), checkInCandidates(), clientGapCandidate(), dedupeCandidates(), DeterministicNudgeDetector, FINAL_STATUSES (+7 more)

### Community 2 - "Nudge Composition and Types"
Cohesion: 0.25
Nodes (11): composeBody(), NaturalNudgeComposer, NudgeComposer, ComposedNudge, ExistingNudgeRef, MetricOpportunity, NudgePriority, PersistedNudge (+3 more)

### Community 3 - "Nudge Action Lifecycle"
Cohesion: 0.24
Nodes (5): NudgeActionGateway, NudgeActionInput, nudgeActionSchema, NudgeActionService, targetType()

### Community 4 - "Snapshot Data Mapping"
Cohesion: 0.36
Nodes (8): iso(), mapProfile(), mapWork(), normalizeRecord(), Row, status(), stringOrNull(), toStringArray()

### Community 6 - "Nudge Record Mapping"
Cohesion: 0.33
Nodes (4): asObject(), mapNudge(), normalizeNudgeKind(), normalizeQuickActions()

### Community 7 - "Engine Regression Tests"
Cohesion: 0.40
Nodes (4): candidate, persisted, profile, snapshot

## Knowledge Gaps
- **12 isolated node(s):** `nudgeActionSchema`, `NudgeActionInput`, `CronAuthorization`, `Row`, `profile` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PersistedNudge` connect `Nudge Composition and Types` to `Engine and Repository Ports`, `Nudge Action Lifecycle`, `Snapshot Data Mapping`, `Delivery State Persistence`, `Nudge Record Mapping`, `Engine Regression Tests`, `Claim Deduplication`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `MartuProactivityDataRepository` connect `Delivery State Persistence` to `Engine and Repository Ports`, `Nudge Composition and Types`, `Nudge Action Lifecycle`, `Snapshot Data Mapping`, `Nudge Record Mapping`, `Claim Deduplication`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `ProactivitySnapshot` connect `Nudge Composition and Types` to `Engine and Repository Ports`, `Deterministic Nudge Detection`, `Snapshot Data Mapping`, `Engine Regression Tests`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `mapNudge()` (e.g. with `.listForCenter()` and `.listPendingForDelivery()`) actually correct?**
  _`mapNudge()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `nudgeActionSchema`, `NudgeActionInput`, `CronAuthorization` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._