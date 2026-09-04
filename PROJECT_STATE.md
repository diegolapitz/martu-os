# Martu OS — estado de integración

Actualizado: 2026-09-03 (America/Argentina/Buenos_Aires)
Responsable de integración: Tech lead / integrador de Martu OS

## Estado actual

| Elemento | Estado |
| --- | --- |
| Rama integrada | `main` |
| HEAD | `87a6993` (`merge: add PDF brief uploads`) |
| Working tree | limpio al cierre de la regresión |
| Destino de producción | Vercel `martu-os`, región `gru1` |
| Base de datos | sin migraciones nuevas |
| Variables de entorno | sin variables nuevas |

## Integración 2026-09-03

- `5c95cc9`: el selector de logo se activa únicamente con su botón explícito;
  ya no abre el diálogo de archivos al hacer click en otros controles.
- `fb33f2f` (integrado en `87a6993`): Brief y Estrategia del onboarding aceptan
  `.pdf`, `.txt` y `.md`. Los PDF con texto seleccionable se extraen en el
  navegador (hasta 20 MB y 50 páginas) y el contenido sigue siendo editable.
  Los PDF escaneados sin capa de texto requieren una versión con texto/OCR.
- `pdfjs-dist` se incorporó como dependencia de cliente para la lectura de PDF.

## Validación antes de producción

- `pnpm lint`: correcto; 3 warnings preexistentes de variables sin usar en el
  agente (`presenter.ts` y `request-planner.ts`).
- `pnpm typecheck`: correcto.
- `pnpm test`: 45 archivos y 228 tests correctos.
- `pnpm build`: correcto con Next.js 16.3.3.

## Política operativa

`main` es la única rama liberable. Los cambios de especialistas se realizan en
ramas y worktrees `codex/*`; el integrador revisa, fusiona, prueba, actualiza
este estado y despliega desde un `main` limpio.
