# Martu OS — estado de integración

Actualizado: 2026-09-04 (America/Argentina/Buenos_Aires)
Responsable: Tech lead / integrador de Martu OS

## Referencia unificada de código

| Elemento | Estado verificado |
| --- | --- |
| Base funcional integrada | `31caa2b` (`docs: update project integration state`) |
| GitHub `origin/main` | `ca470d2` (`fix(agent): enforce operational response direction`) |
| Diferencia local/remota | `main` está **7 commits adelante**, sin commits detrás |
| Worktree de integración | `E:/Escritorio/Python/Proyectos Martu/Martix` en `main` |
| Worktree Supervisora | `Martix-model-ab` en `codex/supervisora/model-ab` / `ca470d2`, limpio |
| Worktree onboarding | `Martix-onboarding-pdf` en `codex/onboarding/pdf-brief-upload` / `fb33f2f`, limpio |

Las dos ramas de especialista son ancestros de `main`: no contienen código que
falte integrar ni código alternativo que haya que elegir. El worktree de
Supervisora es una copia de `origin/main`; el de onboarding ya fue fusionado en
el merge `87a6993`.

## Línea de tiempo consolidada

1. `d4e0c18` — renovación visual, clientes/logos, datos, Instagram y primera
   capa de evaluación de Supervisora.
2. `76c26eb` — planificación semántica de requests/retrieval y evaluaciones de
   capacidades.
3. `0c0b324` y `ca470d2` — response director de la Supervisora y su corrección
   operativa. Este último es el estado hoy publicado en GitHub.
4. `fb33f2f` / merge `87a6993` — importación de briefs y estrategia desde PDF,
   TXT o Markdown durante onboarding.
5. `5c95cc9` — corrección del selector de logo: sólo el botón abre el diálogo
   de archivos; no interfiere con otros controles.
6. `51d3b8b` y `31caa2b` — política multiagente y este registro de integración.

## Solapamientos: resueltos en la historia, no conflictos activos

Los cambios fueron secuenciales, no merges concurrentes. Los solapamientos
reales que requieren coordinación futura son:

- Diseño/Instagram con Supervisora: `package.json` y siete archivos del núcleo
  `src/server/agent/**` (datos, intención, presenter, tipos y evals).
- Planner y response director: `orchestrator.ts`, `ports.ts`, `runtime.ts` y
  `types.ts`.
- Diseño y el último fix de clientes: `globals.css`, `client-workspace.tsx` y
  `clients-view.tsx`.
- Diseño y el importador PDF: `onboarding-wizard.tsx`, `package.json` y lockfile.

No se encontró código perdido. El único commit inalcanzable es `16532c0`, una
versión previa equivalente del documento de estado reemplazada por `31caa2b`.

## Auditoría de chats con acceso al proyecto

Se revisaron los chats Codex que apuntan a este mismo workspace: Diseño
completo, Definir supervisora conversacional, Instagram, Cambiar Gavilán por
Metauro, GitHub, API OpenAI y configuración de Supabase. Los chats generales
sin este workspace no pueden haber modificado este repositorio.

- **Diseño completo** originó la V1 extensa, aplicó migraciones y realizó
  despliegues manuales históricos.
- **Supervisora** corresponde a los commits del planner y response director;
  no tiene trabajo pendiente fuera de `main`.
- **Instagram** está incluido en `d4e0c18` y sus migraciones remotas están
  aplicadas.
- **Metauro** modificó datos primero en PGlite y después directamente en la
  instancia productiva. Eso explica por qué el dato visible y el seed local no
  siempre coincidieron.
- **GitHub** creó el repositorio y lo dejó público; no contiene los siete commits
  locales posteriores.

## Datos y producción: lo que sí y lo que no está unificado

La base Supabase remota tiene aplicadas las mismas 12 migraciones que existen
localmente (hasta `202609020002`). El último deployment de Vercel figura
`Ready` y es de aproximadamente 18 horas antes de esta auditoría.

Eso no prueba que producción ejecute `31caa2b`: Vercel no devolvió el SHA en la
consulta disponible y `main` no se publicó a GitHub desde `ca470d2`.

Hay una divergencia de **datos de demostración**, no de esquema:

- El identificador/ruta histórica es `gavilan`, mientras que gran parte del
  seed y la interfaz ya muestran **Metauro**.
- Producción tiene 6 clientes, 23 tareas, 43 ideas, 27 guiones y 47 contenidos;
  no debe resetearse ni regenerarse desde el seed sin una migración de datos
  explícita.
- Tests, fixtures y documentación aún usan textos de Gavilán en varios casos.

Para completar la unificación semántica hace falta una decisión de producto:
mantener `gavilan` como slug técnico retrocompatible y normalizar el nombre de
demo a Metauro, o migrar también slug/URLs/fixtures. Esa decisión no se toma ni
se ejecuta dentro de una auditoría porque impacta URLs, datos existentes y
pruebas.

## Validación del estado local unificado

Ejecutado sobre `main` el 2026-09-04:

- `pnpm lint`: sin errores; 3 warnings preexistentes de imports/variables sin
  uso en `presenter.ts` y `request-planner.ts`.
- `pnpm typecheck`: correcto.
- `pnpm test`: 45 archivos y 228 tests correctos.
- `pnpm build`: correcto con Next.js 16.3.3.

La consulta de arquitectura actualizó
`graphify-out/cache/last_query_stamp`; es metadato de auditoría, no código de
producto, y queda registrado junto a esta consolidación.

## Bloqueos antes de publicar o desplegar

1. **Seguridad:** rotar en OpenAI y Supabase las credenciales que fueron
   compartidas en historiales de chat; comprobar también los secretos de
   producción en Vercel. No escribir secretos en Git ni en documentación.
2. **Datos demo:** elegir la política `gavilan`/Metauro y preparar una migración
   reversible y probada si se cambia el slug.
3. **Publicación:** tras esos dos puntos, revisar el diff `origin/main..main`,
   hacer push desde este worktree de integración y confirmar el SHA del
   deployment de Vercel. Un push a `main` puede activar un deployment, por lo
   que requiere aprobación explícita del integrador.

Hasta entonces, `main` es la versión local unificada y validada; GitHub y
producción son referencias anteriores que se conservan sin sobrescribir.
