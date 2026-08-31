---
type: "query"
date: "2026-08-31T03:37:36.342574+00:00"
question: "Map onboarding, profile settings, clients, services, persistence migrations, and API Route Handlers for onboarding V2.1"
contributor: "graphify"
outcome: "dead_end"
source_nodes: ["profile", "martuUserId()", "data-repository.ts"]
---

# Q: Map onboarding, profile settings, clients, services, persistence migrations, and API Route Handlers for onboarding V2.1

## Answer

Expanded from original query via graph vocab: [client, profile, service, data, schema, auth, user, work]. The traversal only reached the older proactivity graph (profile, martuUserId(), data-repository.ts) and did not contain onboarding or service-catalog routes, so it was treated as stale and all implementation decisions were verified directly against current source and migrations.

## Outcome

- Signal: dead_end

## Source Nodes

- profile
- martuUserId()
- data-repository.ts