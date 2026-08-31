# Martu OS V1

Un sistema operativo de trabajo para Martu: cada cliente vive en un solo lugar
y una supervisora contextual convierte pendientes, decisiones y promesas en
seguimientos reales.

La V1 es una aplicación web completa en Next.js. En desarrollo puede usar
PGlite como PostgreSQL embebido y persistente; en producción **sólo** usa
Supabase Postgres. La proactividad cloud se ejecuta con Supabase Cron y entrega
avisos mediante Web Push, por lo que el backend no depende de una PC encendida.

## Qué incluye

- Acceso de una única usuaria mediante código y cookie firmada, sin exponer la
  aplicación ni sus APIs.
- `Mi día` con briefing, prioridades reales, agenda, clientes que requieren
  atención y captura rápida.
- Cinco clientes demo con servicios y tabs dinámicas.
- Workspace completo de cliente: brief, estrategia, ideas, guiones, contenido,
  calendario, métricas, pauta, reuniones, notas, archivos y actividad según el
  servicio contratado.
- Un agente con modos internos Supervisor, Estratega, Creativo y Analista.
- CRUD directo de estrategia, ideas, guiones, contenido y trabajo; relaciones
  navegables Idea → Guion → Contenido → Métricas y workflows configurables por
  cliente.
- Calendario Mes/Semana/Día/Agenda, centro de Supervisora con historial,
  memoria editable, hilos abiertos y recibos con Undo.
- Modo demo de IA basado en la base viva y proveedor OpenAI opcional.
- Tools persistentes para tareas, deadlines, compromisos, notas, ideas, guiones
  y estados de contenido, con auditoría y Undo donde corresponde.
- Push-to-talk con `MediaRecorder` y `gpt-4o-transcribe` cuando hay API key.
- `ProactivityEngine`, nudges persistentes, cooldown, quiet hours, check-ins,
  centro de notificaciones y mensajes iniciados por el sistema.
- Configuración persistente de morning/midday/end-of-day, horario silencioso,
  insistencia y preferencias explícitas de comunicación.
- PWA, Service Worker, suscripciones Web Push y deep links desde notificaciones.
- Migraciones y seed reproducible para Supabase.

## Arquitectura

```text
Browser / PWA / MediaRecorder / Service Worker
                    │ HTTPS
                    ▼
             Next.js en Vercel
       UI + route handlers + agente + tools
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
 Supabase Postgres       OpenAI API
          ▲        Responses + Transcription
          │
 Supabase Cron + pg_net ──► /api/scheduler/tick
                              │
                              ▼
                       Web Push / Windows
```

La base separa verdad estructurada, memoria persistente, perfil de
comunicación, contexto reciente y actividad. La detección proactiva, la
redacción del mensaje y el canal de entrega son módulos independientes.

## Requisitos locales

- Windows 10/11.
- Node.js 22 o superior.
- pnpm 11 (`corepack enable` si hiciera falta).
- Chrome o Edge para probar Web Push.

Docker no es necesario para el flujo local de esta V1.

## Ejecutar en Windows

```powershell
corepack enable
pnpm install
Copy-Item .env.example .env.local
pnpm vapid:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000).

`pnpm vapid:generate` actualiza únicamente la configuración local, conserva
otras variables existentes y nunca imprime la clave privada. `.env.local` y la
base `.data/` están ignorados por Git.

El arranque local también verifica migraciones y seed; los comandos explícitos
sirven para dejar el estado claro y para automatización.

### Probar Web Push local

Para una prueba fiel de Service Worker + notificación del sistema:

```powershell
pnpm dev:https
```

Abrir la URL HTTPS indicada por Next.js, habilitar notificaciones en el
navegador y activar `Avisos fuera de la app` desde Configuración. Localhost es
un contexto seguro en Chromium, pero el modo HTTPS se parece más a producción.

## IA real

Agregar a `.env.local`:

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-nano
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

La configuración de prueba prioriza costo mínimo: razonamiento mínimo, llamadas
sin almacenamiento en OpenAI y hasta 500 tokens de salida. Si más adelante el
tono de Nano no alcanza, `gpt-5.6-luna` es el siguiente escalón recomendado.

No pegues ni commitees claves. Al reiniciar, el indicador cambia de `Modo demo`
a `IA real`.

Sin `OPENAI_API_KEY`:

- chat, memoria, tools, acciones y proactividad continúan funcionando;
- las respuestas críticas se componen desde datos reales de la DB demo;
- el micrófono explica que falta configurar la clave y no finge una
  transcripción. Con la clave, grabar ejecuta transcripción, agente y tools en
  un único flujo.

## Base local y Supabase

### Desarrollo local

```dotenv
DB_MODE=pglite
PGLITE_DATA_DIR=.data/martu-os
```

PGlite es PostgreSQL embebido, persistente y exclusivo de desarrollo/test. No
se usa SQLite, archivos JSON como fuente de verdad ni memoria de proceso.

### Producción

1. Crear un proyecto en [Supabase](https://supabase.com/dashboard).
2. En `Connect`, copiar:
   - Transaction pooler como `DATABASE_URL` para Vercel.
   - Direct connection como `DIRECT_URL` para migraciones.
3. Autenticar, enlazar el proyecto y aplicar todas las migraciones cloud:

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref TU_PROJECT_REF
npx supabase@latest db push
```

4. Inicializar una sola vez la usuaria Martu y los cinco clientes demo. El seed
   es idempotente y usa la conexión directa si `DIRECT_URL` está definida:

```powershell
$env:DIRECT_URL="postgresql://postgres.PROJECT:PASSWORD@HOST:5432/postgres"
$env:DB_MODE="postgres"
pnpm db:seed
```

Como alternativa a `supabase db push`, `pnpm db:migrate` incluye
automáticamente las migraciones de extensiones/Cron cuando detecta una conexión
Postgres. No mezclar ambos métodos sobre un proyecto a medio migrar.

5. Después del deploy definitivo de Vercel, configurar URL y Cron sin imprimir
   secretos. `CRON_SECRET` debe ser el mismo valor aleatorio de al menos 32
   caracteres que se cargó en Vercel:

```powershell
$env:NEXT_PUBLIC_APP_URL="https://martu-os.vercel.app"
$env:CRON_SECRET="UN_SECRETO_ALEATORIO_DE_32_O_MAS_CARACTERES"
pnpm db:cron:setup
```

Ese comando guarda `martu_os_app_url` y `martu_os_cron_secret` en Supabase
Vault y programa `/api/scheduler/tick` cada minuto mediante `pg_cron` +
`pg_net`. `supabase/setup-cron.sql` queda como alternativa manual para SQL
Editor/psql y exige ejecutar sus `set_config` dentro de la misma transacción.

6. Smoke test en el SQL Editor:

```sql
select jobname, schedule, active
from cron.job
where jobname like 'martu-os-%';

select *
from net._http_response
order by created desc
limit 10;
```

`pg_net` es asíncrono: `cron.job_run_details` confirma que la llamada fue
encolada y `net._http_response` muestra la respuesta real de Vercel. La
configuración agrega una purga diaria del historial de Cron con 30 días de
retención; los ticks por minuto son seguros de reintentar porque el scheduler
usa leases y deduplicación en Postgres.

La app usa el transaction pooler para tráfico serverless, con prepared
statements desactivados y un pool mínimo. Las migraciones usan la conexión
directa.

## Deploy en Vercel

```powershell
npx vercel@latest login
npx vercel@latest link
npx vercel@latest env add DB_MODE production
npx vercel@latest env add DATABASE_URL production
npx vercel@latest env add OPENAI_API_KEY production
npx vercel@latest env add OPENAI_MODEL production
npx vercel@latest env add OPENAI_TRANSCRIPTION_MODEL production
npx vercel@latest env add MARTU_ACCESS_CODE production
npx vercel@latest env add MARTU_SESSION_SECRET production
npx vercel@latest env add CRON_SECRET production
npx vercel@latest env add NEXT_PUBLIC_APP_URL production
npx vercel@latest env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
npx vercel@latest env add VAPID_PRIVATE_KEY production
npx vercel@latest env add VAPID_SUBJECT production
npx vercel@latest --prod
```

En producción usar `DB_MODE=postgres`. El build o runtime no cae silenciosamente
a PGlite si falta `DATABASE_URL`.

Después del primer deploy, actualizar `NEXT_PUBLIC_APP_URL` y el secreto de URL
en Vercel con el dominio definitivo, redeployar y ejecutar `pnpm db:cron:setup`.

Si se habilita Vercel Deployment Protection, crear además en Supabase Vault un
secreto llamado `martu_os_vercel_bypass_secret` con el bypass token de
automatizaciones de Vercel. El job lo agrega automáticamente como header
`x-vercel-protection-bypass`; sin ese token, Protection bloquearía el Cron.

## Verificación

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

La suite cubre capacidades por servicio, tools y persistencia, deduplicación del
scheduler, promesas creadas desde chat, reprogramación y Undo. Playwright recorre
siete flujos V1 sobre una base creada desde cero: acceso, Trabajo, cliente y
estrategia, Idea → Guion → Contenido, Calendario, notificaciones y Service Worker.

Para invocar manualmente un tick local:

```powershell
$secret = (Get-Content .env.local | Where-Object { $_ -like 'CRON_SECRET=*' }).Split('=', 2)[1]
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/scheduler/tick -Headers @{ Authorization = "Bearer $secret" }
```

## Integraciones

Instagram, Meta Ads, Drive, Calendar, Meet y WhatsApp aparecen como
`Próximamente — no conectado`. Los datos de métricas y pauta de la V1 están
marcados como demo; la UI nunca afirma que exista una conexión real.

La futura integración de WhatsApp debe implementar un
`WhatsAppNotificationProvider` y un webhook que envíe mensajes al mismo
orquestador, contexto, tools y DB. No debe duplicar reglas de negocio.

## Limitaciones conocidas

- El acceso es deliberadamente single-user; no incluye altas de usuarios,
  recuperación de contraseña ni roles multiusuario.
- Web Push depende de permisos, conectividad y soporte del navegador/OS.
- PGlite no emula `pg_cron`, `pg_net`, Vault ni concurrencia de Supabase; por eso
  hace falta un smoke test cloud después del deploy.
- La transcripción real requiere `OPENAI_API_KEY`.
- Si el servicio cloud está caído o no hay conectividad, no se pueden entregar
  avisos; la PC de Martu no necesita mantener un backend local encendido.

## Diseño

Los conceptos aceptados están en [`design/concepts`](design/concepts) y el
sistema visual extraído en [`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md).
La UI no embebe screenshots: contenido, controles, gráficos y estados son código
nativo.
