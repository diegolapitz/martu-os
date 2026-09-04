# Martu OS — estado de integración

Actualizado: 2026-09-02 (America/Argentina/Buenos_Aires)  
Responsable de integración: Tech lead / integrador de Martu OS

## Foto Git verificada

| Elemento | Estado |
| --- | --- |
| Rama integrada | `main` |
| HEAD local y remoto | `76c26eb2d5e75070f2f02a898b2f43b6e2d6ca7b` (`feat(agent): add semantic request planner`) |
| Relación `main...origin/main` | `0` commits adelante / `0` detrás |
| Remoto | `origin` → `https://github.com/diegolapitz/martu-os.git` |
| Ramas locales/remotas detectadas | sólo `main` y `origin/main` |
| Worktrees detectados | uno: el raíz del repositorio, en `main` |
| Tags | ninguno |

La historia disponible tiene tres commits: `a80071d` (base inicial),
`d4e0c18` (diseño, clientes e Instagram) y `76c26eb` (planificador de la
Supervisora). No se encontraron ramas remotas, worktrees alternativos ni
commits paralelos pendientes de integrar.

## Producción

El directorio está vinculado localmente al proyecto Vercel `martu-os` y
`vercel.json` fija la región `gru1`. Esto confirma el destino configurado, no
qué deployment está activo ni qué commit está en producción: la CLI de Vercel
no está instalada en este entorno y no se ejecutó ningún deploy. Por tanto, la
comparación verificable hoy es `main == origin/main`; la comparación contra el
deployment activo queda pendiente de una consulta autenticada a Vercel.

## Trabajo ya integrado en `main`

### Diseño, identidad de clientes y datos — `d4e0c18`

- Renovación visual: sistema de diseño, CSS, layout, shell y vistas de
  calendario, trabajo, cliente y onboarding.
- Identidad de clientes: carga y visualización de logos, rutas API y migración
  `202609020001_client_logos.sql`.
- Datos/clientes: tipos, queries, seed y pruebas de base de datos ajustados.
- Artefactos y guía de diseño: `DESIGN.md`, `design/**`, `design-qa.md` y las
  skills locales de diseño.

### Instagram — `d4e0c18`

- OAuth, sincronización, enlace de media y documentación.
- Módulo `src/server/instagram/**`, rutas `src/app/api/instagram/**` y la
  migración `202609020002_instagram_integration.sql`.
- Pruebas unitarias/de integración de criptografía, OAuth, Meta client,
  repositorio y servicio.

### Supervisora y calidad — `d4e0c18` y `76c26eb`

- `d4e0c18`: evaluador de calidad, escenarios golden, scripts de baseline y
  ajustes de intención, presentación y adaptación de datos.
- `76c26eb`: planificador semántico de requests y retrieval, matriz de
  capacidades, benchmark y pruebas asociadas.

## Puntos de cruce detectados

Los commits ya integrados tocan en común estos siete archivos:

- `package.json`
- `src/server/agent/data-adapter.ts`
- `src/server/agent/evals/golden-scenarios.ts`
- `src/server/agent/golden-evals.test.ts`
- `src/server/agent/intent-router.ts`
- `src/server/agent/presenter.ts`
- `src/server/agent/types.ts`

No hay conflicto de merge pendiente: `76c26eb` sucede a `d4e0c18` en la misma
línea de `main`. Sí hay solapamiento lógico de propiedad entre calidad/
Supervisora y el núcleo del agente; los próximos cambios en esos archivos deben
coordinarse antes de editar.

El mapa de dependencias también sitúa el detector de proactividad y los tipos
del agente como puentes entre datos de clientes, acciones y composición de
respuestas. Por ello, cambios de Supervisora no deben asumirse aislados de
clientes ni de las interfaces del agente.

## Working tree actual: no integrado y sin procedencia confirmada

Hay tres modificaciones locales, sin stage ni commit, sobre cambios de identidad
de cliente introducidos por `d4e0c18`:

| Archivo | Cambio observado | Riesgo/área |
| --- | --- | --- |
| `src/app/globals.css` | Ajusta margen, foco visible y ocultamiento del input de logo. | Diseño/accesibilidad de formulario. |
| `src/components/client-workspace.tsx` | Cambia el selector de archivo de `label` a `button` que activa un input oculto. | Edición de clientes y accesibilidad. |
| `src/components/clients-view.tsx` | Aplica el mismo patrón al alta de clientes. | Alta de clientes y accesibilidad. |

Parecen un ajuste coherente de accesibilidad/UX del flujo de logos, pero no hay
autor, rama ni commit que permita atribuirlos. No deben descartarse, mezclarse
en otro trabajo, ni desplegarse hasta identificar su propietario y validarlos.

Además, `graphify-out/cache/last_query_stamp` quedó modificado por el análisis
de grafo realizado para esta auditoría; es metadato de consulta, no producto.

## Estructura propuesta de ramas y worktrees

El worktree raíz queda reservado a integración y `main`. Crear worktrees
hermanos, cada uno basado en un `main` limpio y actualizado:

| Línea | Rama de ejemplo | Worktree de ejemplo | Alcance inicial |
| --- | --- | --- | --- |
| Diseño | `codex/design/<tema>` | `../Martix-design-<tema>` | UI, estilos, documentación de diseño y pruebas visuales. |
| Supervisora | `codex/supervisora/<tema>` | `../Martix-supervisora-<tema>` | `src/server/agent/**`, evaluaciones y scripts de calidad. |
| Instagram | `codex/instagram/<tema>` | `../Martix-instagram-<tema>` | `src/server/instagram/**`, rutas Instagram, documentación y migraciones propias. |

Una rama sólo se crea cuando exista un tema concreto. Si dos líneas requieren
un archivo compartido, el integrador define orden, interfaz o una rama de
preparación antes de que ambas avancen. Ningún especialista hace deploy;
solamente el integrador fusiona en `main`, ejecuta regresión y libera.

## Próximo control de integración

1. Identificar el dueño de los tres cambios locales de clientes y validar el
   flujo de selección de logo.
2. Antes de aceptar un nuevo trabajo, crear su rama/worktree desde `main` y
   registrar su alcance aquí.
3. Antes del primer deploy bajo esta política, consultar el deployment activo
   de Vercel y comparar su SHA con `main`.
