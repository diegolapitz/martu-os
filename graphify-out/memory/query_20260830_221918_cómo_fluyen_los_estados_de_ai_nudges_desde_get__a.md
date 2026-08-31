---
type: "query"
date: "2026-08-30T22:19:18.212658+00:00"
question: "¿Cómo fluyen los estados de ai_nudges desde GET /api/nudges hasta el badge y el panel de notificaciones en AppShell?"
contributor: "graphify"
outcome: "useful"
source_nodes: [".listForCenter()", "MartuProactivityDataRepository", "PersistedNudge"]
---

# Q: ¿Cómo fluyen los estados de ai_nudges desde GET /api/nudges hasta el badge y el panel de notificaciones en AppShell?

## Answer

Expanded from original query via vocab: [list, center, nudge, status, delivered, pending, notification]. listForCenter alimenta GET /api/nudges; AppShell deriva badge y panel de esa respuesta. La cola pending no representa una entrega y debe quedar fuera de la consulta por defecto, mientras delivered es no leído y seen se presenta como read.

## Outcome

- Signal: useful

## Source Nodes

- .listForCenter()
- MartuProactivityDataRepository
- PersistedNudge