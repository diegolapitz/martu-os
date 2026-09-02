# Design QA — Martu OS 3a

Resultado local: **PASS** (2 de septiembre de 2026).

## Fuente y método

- Fuente normativa: `Rediseño de sitio Vercel.zip`, sección `#t3` del HTML y
  `IMPLEMENTACION-3a.md`.
- Captura de referencia: `C:/Users/Dieg/AppData/Local/Temp/martu-reference-3a.png`.
- Capturas renderizadas: `martu-3a-{day,work,client,calendar,supervisor}-desktop.png`,
  sus variantes mobile y `martu-3a-onboarding-logo-desktop.png` en la misma
  carpeta temporal.
- La referencia y los renders se inspeccionaron juntos a 1440×1000. También se
  verificaron 390×844 y los breakpoints de 760/900/1180 px.
- El Browser integrado no expuso su runtime de control en esta sesión. Se usó
  Playwright Chromium como fallback para navegación, consola, requests,
  screenshots, overflow y flujos E2E.

## Ledger de fidelidad

| Superficie | Estado | Evidencia |
| --- | --- | --- |
| Tipografía | PASS | Schibsted Grotesk en UI; IBM Plex Mono sólo en fecha, conteos y overlines. |
| Paleta | PASS | Canvas `#EEF0ED`, superficies blancas, tinta negra y lima limitada a Supervisora. |
| Shell | PASS | Sidebar clara con registro de clientes, topbar persistente y regla superior semántica. |
| Mi día | PASS | Tres conteos, foco con rail del cliente, prioridades y rail contextual. |
| Trabajo | PASS | Registro Trabajo · Cliente · Estado · Vence; filtros y CRUD directo. |
| Cliente | PASS | Cabecera, tabs y workspaces reales; deep links canónicos conservados. |
| Calendario | PASS | Mes, filtros, colores por cliente y lectura segmentada de carga. |
| Supervisora | PASS | Sistema neutral con marca lima acotada; memoria y conversaciones preservadas. |
| Onboarding | PASS | Flujo responsive; selección, recorte, subida y lectura real de logo WebP. |
| Responsive | PASS | Cero overflow horizontal en todas las rutas capturadas a 1440 y 390 px. |
| Consola | PASS | Sin `console.error`, warnings de aplicación ni `pageerror` durante el recorrido. |
| Accesibilidad | PASS | Nombres accesibles, foco visible, controles táctiles y reduced motion. |

## Diferencias deliberadas

- La referencia estática muestra una porción ilustrativa de Mi día; la app real
  conserva más datos, estados vacíos, acciones y rails existentes.
- Los colores persistidos de clientes siguen siendo fuente de verdad; los cinco
  valores canónicos actúan como fallback visual.
- No se incrustó ningún PNG/HTML del concepto. Toda la interfaz es React/CSS
  nativo conectado al producto.

## Verificación funcional

- Logo onboarding: recorte WebP, `POST /logo` 200, `GET /logo` 200,
  `content-type: image/webp`.
- Vitest: 39 archivos, 209 tests aprobados.
- Playwright: 7/7 E2E aprobados (login/onboarding, Trabajo CRUD, cliente y
  estrategia, Idea→Guion→Contenido, calendario CRUD, notificaciones y Web Push).
- ESLint, TypeScript y build de producción: aprobados.
