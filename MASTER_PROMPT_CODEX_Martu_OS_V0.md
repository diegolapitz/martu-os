# MASTER PROMPT — CODEX — MARTU OS V0

## INSTRUCCIÓN PRINCIPAL

Construí **Martu OS V0** end-to-end.

Este archivo es autosuficiente. No hace falta pedir contexto adicional antes de empezar.
No me pidas confirmaciones por detalles menores: tomá decisiones razonables y seguí.

La prioridad es validar un producto para una sola usuaria real: Martu.

Antes de implementar:
- leé TODO este archivo;
- usá las skills disponibles de diseño, frontend, UX/UI, React/Next, testing y cualquier otra que mejore el resultado;
- generá primero conceptos visuales de las superficies principales;
- implementá después;
- ejecutá;
- probá;
- corregí;
- no termines sólo porque compila.

---

# PROMPT PARA CODEX — Martu OS V0

Quiero que construyas un prototipo funcional end-to-end llamado temporalmente **Martu OS**.

No quiero una maqueta estática. Quiero una aplicación local usable con frontend, backend y base de datos real, con datos demo ricos y coherentes.

## Contexto del producto

Martu acaba de dejar una agencia de marketing digital para trabajar como freelancer con varios clientes.

Su mayor problema no es solamente “organizar tareas”. Trabaja sola y perdió a la líder que antes le imponía deadlines, le preguntaba por avances y la mantenía bajo presión.

Además, su información está fragmentada:
- Drive para guiones y contenido;
- WhatsApp para hablar con clientes;
- Instagram para métricas;
- Meta para pauta;
- Trello para calendario;
- otras herramientas para edición.

Quiere un solo lugar donde “viva” cada cliente y, por encima, una IA que se comporte como supervisora + compañera de trabajo: contextual, proactiva, natural y con memoria.

IMPORTANTE: cada cliente contrata servicios distintos. Un cliente puede tener servicio integral; otro solamente guiones/grabación/edición; otro CM; otro estrategia+pauta. La interfaz y la lógica deben adaptarse a los servicios de cada cliente.

Si en el repositorio existe `Audios de Martu.md`, leelo completo antes de tomar decisiones de producto. Es material de discovery real y tiene prioridad sobre suposiciones genéricas.

## Forma de trabajar

Quiero un intento fuerte de primera versión, con criterio propio.

No me preguntes detalles menores. Cuando haya ambigüedad, tomá decisiones razonables y documentalas.

Antes de programar:

1. Leé esta especificación completa.
2. Explorá el repositorio si ya existe.
3. Usá las skills instaladas que correspondan. En particular:
   - `build-web-apps/frontend-app-builder`
   - `build-web-apps/react-best-practices`
   - cualquier skill de diseño/UI/UX o testing disponible que mejore el resultado.
4. Actuá primero como product designer senior y después como engineer.
5. Generá conceptos visuales con Image Gen para las superficies principales antes de implementar, siguiendo la skill de frontend:
   - login falso;
   - Mi Día;
   - Cliente Gavilán / Resumen;
   - Cliente Gavilán / Guiones;
   - estado con panel de IA abierto.
6. Extraé un sistema visual coherente y usalo durante toda la app.
7. Implementá.
8. Ejecutá frontend y backend.
9. Seed de DB.
10. Navegá la aplicación real en browser.
11. Probá los flujos críticos.
12. Compará el resultado visual contra los conceptos y corregí cualquier drift importante.
13. No termines hasta que la V0 sea funcional y visualmente convincente.

No necesito que me vayas pidiendo aprobación en cada paso: esto es un experimento one-shot. Si una skill exige aprobación sólo cuando se usa un modo específico de planificación, evitá ese modo y seguí con ejecución normal.

---

# PRODUCTO

## 1. Un solo usuario

La V0 es únicamente para Martu.

NO implementar auth real ni multiusuario.

## 2. Login falso

Crear una primera pantalla hermosa y mínima.

Copy:

**Acá te loguearías si esto fuera para otra persona.**  
Pero lo hice para vos, Martu. Entrá nomás. Te amo.

Botón:
**Entrar a laburar**

Texto secundario opcional:
**Prometo romperte las pelotas con los deadlines.**

Al clickear, entrar directamente a la app.

---

# HOME PRINCIPAL — MI DÍA

Debe ser la pantalla protagonista.

No quiero un dashboard genérico con 25 KPIs.

Quiero que responda inmediatamente:

**¿Qué debería hacer Martu hoy?**

Debe incluir:

### Supervisora IA
Un bloque protagonista con tono natural.

Ejemplos:
- “Buen día, Martu. Hoy hay tres cosas que yo no patearía.”
- “Gavilán vence mañana y todavía falta cerrar el tercer guion. ¿Lo hacemos hoy?”
- “Ayer dijiste que ibas a editar el reel de Luma y sigue como Grabado. ¿Qué pasó?”

### Prioridades
Máximo 3–5, realmente priorizadas.

### Agenda
Tareas/reuniones/deadlines de hoy.

### Clientes que necesitan atención
Sólo los relevantes, no una grilla decorativa.

### Captura rápida
Un input tipo:
“Anotá algo…”

La IA puede clasificarlo como nota, idea, tarea, recordatorio, etc.

---

# NAVEGACIÓN

Sidebar limpia:

- Mi día
- Clientes
- Calendario
- Supervisor IA
- Integraciones
- Configuración

La IA debe poder abrirse en panel lateral desde cualquier pantalla.

Si estoy dentro de Gavilán y digo:
“¿Qué falta esta semana?”
debe interpretar automáticamente que hablo de Gavilán.

---

# MODELO DE SERVICIOS POR CLIENTE

Crear servicios:

- Estrategia
- Community Management
- Creación de contenido
- Ideas / planificación
- Guiones
- Grabación
- Edición
- Publicación
- Historias
- Métricas / reporting
- Meta Ads / pauta
- Reuniones / account management

Permitir servicios personalizados.

Los servicios determinan:
- pestañas;
- flujos;
- estados;
- alertas;
- recomendaciones;
- datos relevantes para IA.

Regla crítica:
**Nunca reclamarle a Martu cosas que no forman parte del servicio de ese cliente.**

---

# PÁGINA DE CLIENTE

Al entrar a Gavilán debe sentirse que “todo Gavilán vive acá”.

## Header

- nombre;
- descripción;
- estado;
- servicios activos;
- próximo deadline;
- última actividad;
- botón Añadir nota;
- acceso IA.

## Tabs dinámicas

### Resumen
Siempre.

Mostrar:
- próximos deadlines;
- trabajo en curso;
- pendientes;
- últimas notas;
- últimas reuniones;
- contenido reciente;
- brief/estrategia incompletos;
- insights;
- actividad.

### Estrategia
Si aplica.

Brief y estrategia deben ser datos reales consultables, no sólo nombres de archivos.

Incluir:
- objetivos;
- audiencia;
- tono;
- posicionamiento;
- pilares;
- estrategia;
- versiones;
- decisiones;
- hipótesis;
- sugerencias IA.

### Ideas
Si aplica.

Histórico buscable/filtrable:
- título;
- descripción;
- fecha;
- origen;
- estado;
- tags;
- link a contenido final si existió.

### Guiones
Si aplica.

Vista de listado y editor/detail agradable.

Campos:
- título;
- fecha;
- formato;
- objetivo;
- hook;
- cuerpo;
- CTA;
- estado;
- notas;
- versión;
- contenido asociado;
- publicación;
- métricas si existen.

Los guiones deben sentirse como documentos de trabajo, no como filas de una DB.

### Contenido
Si aplica.

Pipeline adaptable:
Idea → Guion → Para grabar → Grabado → Editando → Listo → En aprobación → Aprobado → Programado → Publicado → Entregado.

No todos los clientes usan todos los estados.

Permitir lista y una vista board útil si queda bien.

### Calendario
Deadlines, reuniones, grabaciones, entregas, aprobaciones y publicaciones.

### Métricas
Sólo si corresponde.

Datos demo coherentes:
- alcance;
- views;
- retención;
- guardados;
- compartidos;
- comentarios;
- clics;
- consultas/conversiones.

Relacionar contenido + guion + métricas.

La IA puede identificar asociaciones y plantear experimentos, pero NO afirmar causalidad sin evidencia.

### Pauta
Sólo si corresponde.

Datos demo:
- campañas;
- anuncios;
- gasto;
- CTR;
- CPC;
- CPA;
- ROAS;
- estado;
- observaciones.

Nunca fingir conexión real con Meta.

### Reuniones y notas
Siempre.

Reuniones:
- fecha;
- resumen;
- decisiones;
- compromisos;
- próximos pasos.

Notas privadas:
- texto;
- fecha/hora automática;
- tags opcionales;
- búsqueda.

Ejemplo:
“Volvió a pedir videos institucionales. Recordar plantear en próxima reunión que los últimos rindieron peor.”

### Archivos
Metadata + links demo reales en DB.
No Drive real.

### Actividad
Timeline cronológica de todos los eventos del cliente.

---

# CINCO CLIENTES DEMO

Generá seed data suficientemente rico como para que Martu sienta que la app viene siendo usada hace meses.

## Gavilán — integral
- Estrategia
- CM
- Ideas
- Guiones
- Grabación
- Edición
- Publicación
- Historias
- Métricas
- Meta Ads
- Reuniones

Es el cliente estrella de la demo.

## Luma Estudio — contenido solamente
- Ideas
- Guiones
- Grabación
- Edición

Martu entrega contenido.
NO publicación.
NO métricas.
NO pauta.
La UI debe reflejarlo.

## Casa Norte — community/publicación
- CM
- Historias
- Publicación
- Ideas
- Reuniones

## Brava Fit — contenido + performance orgánico
- Estrategia
- Ideas
- Guiones
- Grabación
- Edición
- Publicación
- Métricas
- Reuniones

Sin pauta.

## Nido — estrategia + pauta
- Estrategia
- Meta Ads
- Métricas
- Reuniones

Poco orgánico.

Generá por cliente, cuando corresponda:
- 8–20 ideas;
- 6–15 guiones;
- 8–20 contenidos;
- 4–10 notas;
- 2–5 reuniones;
- tareas completas/pendientes/vencidas;
- deadlines;
- brief;
- estrategia;
- actividad;
- métricas;
- campañas.

Usá fechas relativas al momento de seed.

Muy importante:
**los datos deben cruzarse.**
Un guion puede convertirse en reel; ese reel puede publicarse; esa publicación tiene métricas; una reunión puede explicar por qué se tomó una decisión.

No uses lorem ipsum ni datos genéricos sin sentido.

---

# IA REAL + MODO DEMO

No estamos creando un modelo desde cero.

Implementá un proveedor de IA desacoplado.

Variables:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Default:
`gpt-5.6-terra`

Si existe API key:
usar OpenAI Responses API y un modelo real.

Si no existe:
la app sigue funcionando en **Modo demo de IA**, con respuestas simuladas excelentes para los principales casos.

Mostrar un indicador discreto de “IA real” vs “Modo demo”.

Nunca hardcodear ni commitear una API key.

## Un agente/orquestador, no una locura multiagente

Para V0 quiero UN agente principal con capacidades/modos internos:

- Supervisor
- Estratega
- Creativo
- Analista

Diseñá el código para poder separar agentes más adelante, pero no introduzcas complejidad sin beneficio.

## Contexto

La IA debe recuperar sólo el contexto relevante:
- usuario;
- cliente actual;
- servicios;
- brief;
- estrategia;
- tareas/deadlines;
- notas;
- reuniones;
- guiones;
- contenido;
- métricas;
- pauta;
- memoria;
- conversación reciente.

No mandar indiscriminadamente toda la DB en cada prompt.

## Memoria

Persistir:
- historial de chat;
- memoria global de Martu;
- memoria separada por cliente;
- preferencias de comunicación.

Crear un `communication_profile` que pueda evolucionar gradualmente:
- formalidad;
- longitud;
- tono;
- expresiones;
- nivel de insistencia;
- preferencias explícitas.

No fine-tuning.

## Personalidad

Español rioplatense.

Humana, directa, inteligente, algo graciosa, capaz de insistir.

NO:
- coach motivacional;
- lenguaje corporativo robótico;
- excesiva dulzura;
- paternalismo;
- caricatura llena de lunfardo.

Ejemplo correcto:
“Martu, Gavilán vence mañana y el tercer guion sigue abierto. ¿Lo pateamos conscientemente o lo cerramos hoy?”

## Acciones desde chat

Permitir que la IA pueda, usando tools/funciones del backend:
- crear tarea;
- completar tarea;
- cambiar deadline;
- crear nota;
- crear idea;
- crear borrador de guion;
- cambiar estado de contenido;
- registrar compromiso.

Ejemplo:
Martu: “Pasá el tercer guion de Gavilán al viernes.”
IA: actualiza DB y responde qué hizo.

Agregar Undo cuando sea práctico.

---

# PROACTIVIDAD

La diferencia del producto es que no debe ser pasivo.

Generar nudges desde reglas reales:

- tareas vencidas;
- tareas que vencen pronto;
- brief faltante;
- estrategia faltante;
- compromiso de reunión sin tarea;
- contenido estancado;
- deadline sin avance;
- oportunidad en métricas demo.

La lógica de detección puede ser determinística.
La IA puede encargarse de redactarlo en lenguaje natural.

La V0 debe generar nudges de forma proactiva mientras el backend corre, aunque la web no esté en primer plano.

Debe incluir notificaciones nativas de Windows y conversaciones iniciadas por la IA.

Aclarar únicamente la limitación real:
“Si la PC o el servicio local están apagados, Martu OS no puede avisarte. Más adelante esto podrá correr en un servidor y notificar por push/WhatsApp/email.”

---

# INTEGRACIONES

Crear pantalla muy linda de integraciones:

- Instagram
- Meta Ads
- Google Drive
- Google Calendar
- Google Meet
- WhatsApp

TODAS:
**Próximamente — no conectado**

Podés mostrar qué habilitarían, pero jamás simular que se autenticaron o que están trayendo datos reales.

---

# DISEÑO

Esto es CRÍTICO.

No quiero una UI generada genérica.

Inspiración, sin clonar:

- Sunsama: “Mi día”, calma, foco, planificación.
- Attio: cliente como entidad rica y actividad contextual.
- Linear: navegación precisa y densidad controlada.
- Notion: guiones/notas/estrategia como documentos cómodos.
- CampaignSwift: workflow de marketing y AI copilots.

Dirección:

- muy buena tipografía;
- jerarquía visual;
- clean;
- moderna;
- cálida;
- algo creativa;
- profesional;
- aire;
- no infantil;
- no “AI purple gradient”;
- no card soup;
- no bento por default;
- no 800 pills;
- no 15 KPIs arriba;
- no sidebar recargada;
- no Bootstrap-looking;
- no dashboard corporativo aburrido.

Desktop principal: 1440x900.
Responsive razonable.

Preferir información bien jerarquizada a decorar.

La home debe sentirse distinta a la página del cliente.
La página de cliente puede ser más densa.
Los guiones deben ser cómodos de leer/escribir.
La IA lateral debe sentirse integrada, no un chatbot pegado.

---

# ARQUITECTURA

Quiero local-first y simple.

Aplicación:
- Next.js
- TypeScript
- desplegable en Vercel
- frontend y API serverless en un único proyecto

Base de datos:
- Supabase Postgres
- NO SQLite para producción
- migraciones + seed
- preparar `pgvector` si resulta útil para memoria semántica

Proactividad:
- usar Supabase Cron (`pg_cron`) como scheduler de V0
- ejecutar al menos cada minuto un endpoint seguro `/api/scheduler/tick`
- protegerlo con `CRON_SECRET`
- Web Push + Service Worker + VAPID para notificaciones persistentes aunque la web no esté abierta
- almacenar `push_subscriptions` en DB
- click de notification debe abrir el contexto correcto

Audio V0:
- implementar botón push-to-talk con `MediaRecorder`
- enviar audio a `/api/ai/transcribe`
- usar `gpt-4o-transcribe`
- el texto resultante entra al MISMO pipeline de agente, contexto y tools que el chat escrito
- no hace falta voz de salida en V0
- preparar abstracción para Realtime API futura

Agregar:
- `.env.example`;
- migraciones;
- seed reproducible;
- README;
- instrucciones precisas para desplegar Vercel + Supabase y configurar Web Push.

No depender de un proceso local encendido.

---

# ENTIDADES SUGERIDAS

Modelá de forma limpia, ajustando lo necesario:

- User
- Client
- Service
- ClientService
- Brief
- Strategy
- Idea
- Script
- ContentItem
- Task
- Note
- Meeting
- FileLink
- MetricSnapshot / ContentMetric
- AdCampaign
- AdCreative
- ChatThread
- ChatMessage
- Memory
- CommunicationProfile
- AiNudge
- ActivityEvent

No sobrediseñar relaciones innecesarias, pero tampoco guardar todo en JSON sin estructura.

---

# FLUJOS QUE TENÉS QUE PROBAR ANTES DE TERMINAR

1. Login falso → Mi Día.
2. Mi Día carga prioridades coherentes.
3. Entrar a Gavilán.
4. Navegar sus tabs.
5. Encontrar un guion viejo.
6. Editar/crear una nota privada y verla con fecha/hora.
7. Crear una idea.
8. Cambiar un contenido de estado.
9. Ver actividad actualizada.
10. Preguntar “¿qué tengo pendiente con Gavilán?”
11. Decir “pasá el tercer guion al viernes”.
12. Ver el deadline actualizado realmente en DB/UI.
13. Preguntar “¿por qué habíamos decidido hacer videos más cortos?” y responder usando memoria demo.
14. Ir a Luma y verificar que NO aparecen métricas ni pauta ni obligaciones de publicación.
15. Ir a Brava Fit → métricas → pedir una hipótesis.
16. Ir a Nido → pauta → pedir recomendaciones.
17. Integraciones deja clarísimo que nada externo está conectado.
18. Reiniciar backend/app y comprobar persistencia.

---

# VERIFICACIÓN

No cierres la tarea sólo porque compila.

- ejecutá la app;
- inspeccioná errores de consola;
- probá endpoints;
- navegá en browser;
- testeá desktop y viewport menor;
- verificá empty/loading/error states básicos;
- verificá los flujos listados;
- compará screenshots del browser con el concepto visual;
- corregí desajustes;
- corré lint/typecheck/tests/build;
- dejá el repo limpio.

Al final entregame:

1. qué construiste;
2. arquitectura;
3. cómo ejecutarlo en Windows;
4. cómo activar IA real;
5. qué queda en modo demo;
6. limitaciones conocidas;
7. próximos 5 pasos recomendados.

## REGLA FINAL

Si aparece una decisión entre:

A) agregar otra feature superficial  
B) mejorar la sensación de “todo mi cliente vive acá + mi supervisora realmente me conoce”

elegí **B**.

Quiero que Martu abra esto y piense:
**“Pará... esto sí está hecho para cómo laburo yo.”**

# REQUISITO NO NEGOCIABLE — PROACTIVIDAD REAL

Releé esto antes de implementar:

**Si Martu tiene que acordarse de abrir la app para que la app la supervise, el producto fracasó.**

La proactividad NO es una mejora futura. Es parte del MVP/V0.

## Implementar `ProactivityEngine`

Backend con scheduler persistente que revise, como mínimo:

- vencidos;
- próximos vencimientos;
- tareas prometidas para hoy;
- compromisos creados desde conversaciones;
- tareas sin progreso;
- contenidos estancados;
- reuniones con compromisos sin resolver;
- recordatorios explícitos;
- brief/estrategia pendiente cuando corresponda;
- insights demo relevantes.

Persistir `AiNudge` y su ciclo de vida.

Debe existir control de spam/cooldown.

## Notificaciones Windows

Martu OS debe poder **interrumpir a Martu sin que ella abra la web** mediante Web Push persistente entregado por el navegador/service worker y mostrado por el sistema operativo.

Abstraer esto como `NotificationProvider`.

La implementación web de V0 debe usar Web Push + Service Worker. No depender de APIs nativas específicas de Windows.

Cuando sea viable, click en la notificación debe abrir la app en la vista/contexto relacionado.

La web además tendrá:
- centro de notificaciones;
- mensajes de IA iniciados por el sistema;
- badge de pendientes.

## Promesas hechas hablando

Caso crítico:

Martu:
“mañana termino el tercer reel de Luma.”

La IA NO debe limitarse a responder.

Debe detectar que existe un compromiso accionable y registrar una estructura persistente equivalente a:
- cliente=Luma;
- entidad/tarea relacionada;
- intención=terminar reel;
- fecha=mañana;
- source=chat.

Cuando llegue el momento, el scheduler verifica estado.

Si no está resuelto, el sistema inicia:

“Martu, ayer dijiste que hoy cerrabas el tercer reel de Luma y sigue abierto. ¿Qué hacemos?”

Quick actions:
- Lo hago ahora
- Pasalo a…
- Ya está
- No me jodas con esto

Las acciones modifican DB, reminder y/o perfil de comunicación según corresponda.

## Check-ins

Crear configuración para:
- morning briefing;
- midday check;
- end-of-day opcional;
- quiet hours;
- insistence level.

Con defaults razonables para la demo.

## Persistencia y restart

Al reiniciar backend:
- recuperar nudges;
- recalcular vencidos;
- no duplicar;
- hacer catch-up razonable.

## Limitación explícita

Como la V0 corre en cloud, no depende de que la PC de Martu tenga un backend local encendido. La entrega push sí depende de conectividad y permisos del navegador/dispositivo.

La arquitectura del motor debe separar:
- detección;
- redacción;
- canal de entrega;

para poder sumar luego push/WhatsApp/email sin reescribir reglas.

## TEST OBLIGATORIO

Antes de terminar:

### Test A
1. Crear tarea de Gavilán que venza en 2–5 minutos.
2. Dejar browser sin foco.
3. Scheduler la detecta.
4. Windows muestra notificación nativa.
5. Click abre Martu OS/contexto.
6. Responder “pasalo a mañana”.
7. Verificar cambio real en DB.
8. Verificar próximo seguimiento.

### Test B
1. Escribir en chat: “mañana termino el reel de Luma”.
2. Verificar que se registra compromiso estructurado.
3. Simular/avanzar reloj o crear una variante de test con vencimiento corto.
4. Verificar que Martu OS inicia la conversación/notification sin prompt del usuario.

Si estos dos tests no funcionan, **NO consideres terminada la V0**, aunque todo lo demás esté lindo.


# MODELO MENTAL DE MEMORIA Y AGENTE — OBLIGATORIO

No asumas que el LLM “se acuerda”.

Separar:

1. Verdad estructurada en Postgres:
   servicios, tareas, deadlines, compromisos, contenidos, reuniones, métricas.

2. Memoria persistente:
   preferencias de Martu, decisiones de cliente, aprendizajes y hechos durables.

3. Perfil de comunicación:
   formalidad, longitud, humor, insistencia, quiet hours y preferencias explícitas.

4. Contexto reciente:
   últimos mensajes relevantes.

5. Memoria semántica opcional:
   embeddings/pgvector para briefs, estrategias, reuniones, notas y guiones largos.

Cada turno:
- identificar scope;
- recuperar sólo contexto relevante;
- llamar al modelo;
- permitir tools;
- ejecutar tools en backend;
- persistir resultado;
- extraer memorias durables con criterio.

Los compromisos y deadlines NUNCA deben quedar sólo como texto de conversación.

# EJEMPLO DE AUDIO + MEMORIA + RECORDATORIO

Martu dice por micrófono:
“Che, el tercer guion de Gavilán lo termino mañana. Recordámelo a las diez.”

Flujo obligatorio:
1. MediaRecorder graba.
2. gpt-4o-transcribe genera texto.
3. agente recibe cliente/contexto.
4. agente llama `create_commitment` y `create_reminder`.
5. DB persiste.
6. Supabase Cron llama `/api/scheduler/tick`.
7. al llegar la hora, detectar reminder.
8. generar nudge.
9. enviar Web Push.
10. service worker muestra notificación aunque la pestaña no esté abierta.
11. click abre Gavilán.
12. si Martu dice “pasalo al viernes”, tool actualiza DB y el siguiente seguimiento.

Este flujo es criterio de aceptación.


---

# ARQUITECTURA WEB DE REFERENCIA

La siguiente sección aclara el modelo técnico esperado para que no construyas una arquitectura local equivocada.

# Martu OS — Arquitectura V0 para Web en Vercel

## Idea mental

La IA NO está despierta todo el tiempo.
La IA NO guarda por sí sola toda la memoria.
La IA NO es el scheduler.

Martu OS tiene cuatro piezas:

1. **Web/PWA** — lo que usa Martu.
2. **Base de datos** — la memoria real.
3. **Motor proactivo/scheduler** — el despertador.
4. **OpenAI** — interpreta, conversa, analiza y decide qué herramientas usar.

---

## Arquitectura recomendada

```text
                 ┌──────────────────────────────┐
                 │        MARTU / BROWSER       │
                 │  Web + PWA + micrófono       │
                 │  Service Worker / Web Push   │
                 └──────────────┬───────────────┘
                                │ HTTPS
                                ▼
                 ┌──────────────────────────────┐
                 │       NEXT.JS / VERCEL       │
                 │ UI + API backend serverless  │
                 │                              │
                 │ /api/ai/chat                 │
                 │ /api/ai/transcribe           │
                 │ /api/tools/*                 │
                 │ /api/scheduler/tick          │
                 │ /api/push/subscribe          │
                 └───────┬──────────┬───────────┘
                         │          │
              SQL        │          │ API
                         ▼          ▼
          ┌──────────────────┐   ┌────────────────────┐
          │ SUPABASE POSTGRES│   │      OPENAI API    │
          │                  │   │                    │
          │ clientes         │   │ GPT-5.6 Terra     │
          │ servicios        │   │ GPT-4o Transcribe │
          │ tareas           │   │ (Realtime futuro) │
          │ guiones          │   └────────────────────┘
          │ notas            │
          │ reuniones        │
          │ memorias         │
          │ compromisos      │
          │ push_subscriptions│
          └────────┬─────────┘
                   │
                   │ cada minuto
                   ▼
          ┌──────────────────┐
          │  SUPABASE CRON   │
          │    pg_cron       │
          └────────┬─────────┘
                   │ llama con secreto
                   ▼
          /api/scheduler/tick
                   │
                   ▼
          detecta recordatorios
                   │
                   ▼
          ┌──────────────────┐
          │     WEB PUSH     │
          │ servicio browser│
          └────────┬─────────┘
                   │
                   ▼
          Notificación Windows/móvil
```

---

# 1. Frontend + backend

Usar **Next.js + TypeScript** en Vercel.

Para V0 no conviene React/Vite + FastAPI separado.

Next.js permite tener:
- la interfaz;
- las rutas API/backend;
- acceso a DB;
- llamadas a OpenAI;
- envío de push;

en un mismo proyecto.

Las funciones de Vercel no están corriendo 24/7. Se ejecutan cuando reciben una petición.

Por eso el scheduler vive conceptualmente separado.

---

# 2. Base de datos

Usar **Supabase Postgres**, NO SQLite.

SQLite depende de un archivo local persistente y no es adecuado para una función serverless en Vercel.

Tablas importantes:

- clients
- services
- client_services
- briefs
- strategies
- ideas
- scripts
- content_items
- tasks
- notes
- meetings
- memories
- communication_profile
- commitments
- reminders
- ai_nudges
- chat_threads
- chat_messages
- push_subscriptions
- activity_events

---

# 3. Qué significa que la IA “aprenda”

No entrenar modelos.

La sensación de aprendizaje surge de guardar información y recuperarla inteligentemente.

## Capa A — verdad estructurada

Cosas que NO deben depender de la memoria difusa de un LLM:

- qué servicios tiene cada cliente;
- deadlines;
- estado de tareas;
- publicaciones;
- guiones;
- reuniones;
- métricas;
- compromisos;
- recordatorios.

Todo eso vive en tablas normales.

## Capa B — memoria explícita

Ejemplos:

- “Martu prefiere que no la jodan antes de las 9.”
- “Gavilán rechazó los videos demasiado institucionales.”
- “Martu quiere que los deadlines importantes se recuerden con 3 días de anticipación.”
- “El cliente Nido prefiere propuestas concretas y cortas.”

Cada memoria guarda:
- scope: global o cliente;
- texto/facto;
- categoría;
- fecha;
- origen;
- importancia;
- última utilización.

## Capa C — perfil de comunicación

Un objeto estructurado:

- idioma: español rioplatense;
- formalidad;
- longitud preferida;
- humor;
- nivel de insistencia;
- quiet hours;
- palabras/expresiones habituales;
- preferencias explícitas.

Se actualiza gradualmente.

## Capa D — memoria semántica (cuando haga falta)

Para briefs, estrategias, reuniones largas, notas y muchos guiones se puede agregar `pgvector`.

Se crean embeddings y, ante una pregunta, se recuperan sólo los fragmentos relevantes.

No hace falta meter toda la historia de Gavilán en cada llamada.

---

# 4. Qué pasa cuando Martu habla con la IA

Ejemplo:

> “Che, el tercer guion de Gavilán lo termino mañana. Recordámelo a las diez.”

## Paso 1 — Audio

Martu mantiene apretado el botón de micrófono.

El navegador graba con `MediaRecorder`.

## Paso 2 — Transcripción

El audio se manda a:

`POST /api/ai/transcribe`

Ese endpoint usa OpenAI Speech-to-Text, inicialmente `gpt-4o-transcribe`.

Resultado:

> “Che, el tercer guion de Gavilán lo termino mañana. Recordámelo a las diez.”

## Paso 3 — Armado de contexto

El backend detecta:
- usuaria = Martu;
- cliente = Gavilán;
- pantalla actual si existe;
- tareas/guiones relevantes;
- servicios del cliente;
- memorias importantes;
- perfil de comunicación;
- conversación reciente.

## Paso 4 — IA

Se llama a GPT-5.6 Terra con:
- instrucciones de supervisora;
- contexto recuperado;
- mensaje;
- lista de herramientas disponibles.

Herramientas ejemplo:

- `search_client_context`
- `create_task`
- `update_task`
- `create_commitment`
- `create_reminder`
- `add_note`
- `create_idea`
- `update_content_status`
- `save_memory`

## Paso 5 — Tool call

El modelo puede decidir:

`create_commitment(client=Gavilan, task=guion_3, due=mañana, remind_at=10:00)`

La aplicación ejecuta esa función.

La IA NO escribe directamente en la DB.

## Paso 6 — Persistencia

Se guarda:
- compromiso;
- reminder;
- conversación;
- actividad.

Respuesta:

> “Listo. Mañana a las 10 te voy a romper las pelotas con el tercer guion de Gavilán.”

---

# 5. Cómo funciona el recordatorio si la web está cerrada

## Registro inicial

La primera vez:

> “¿Querés que Martu OS pueda avisarte aunque no tengas la web abierta?”

Martu acepta.

El navegador:
1. registra un Service Worker;
2. pide permiso de notificaciones;
3. genera una PushSubscription;
4. manda esa suscripción al backend;
5. se guarda en `push_subscriptions`.

## Scheduler

Supabase `pg_cron` llama cada minuto a:

`POST https://martu-os.vercel.app/api/scheduler/tick`

con un secreto.

Ese endpoint busca:

```sql
reminders
WHERE remind_at <= now()
AND status = 'pending'
```

También ejecuta reglas:
- vence pronto;
- vencido;
- compromiso incumplido;
- contenido estancado;
- etc.

## Redacción

Para algo importante puede llamar a OpenAI:

Datos fríos:
- Gavilán
- guion 3
- prometido ayer
- debía estar hoy
- sigue pendiente

Salida:

> “Martu, ayer dijiste que hoy cerrabas el tercer guion de Gavilán y sigue abierto. ¿Qué hacemos?”

Para avisos simples puede usar templates y no gastar API.

## Web Push

El backend envía un Web Push a la suscripción guardada.

El navegador recibe el push mediante el Service Worker aunque la pestaña no esté abierta.

Windows muestra la notificación del sistema.

Al click:
- abre Martu OS;
- navega al cliente/tarea/chat correspondiente.

---

# 6. Vercel Cron vs Supabase Cron

Vercel Cron:
- Hobby: sólo una vez por día y precisión horaria.
- Pro/Enterprise: hasta cada minuto.

Para que la V0 no dependa de pagar Vercel Pro, usar **Supabase Cron (`pg_cron`)** como reloj y hacer que invoque un endpoint seguro de Vercel cada minuto.

La lógica del reminder sigue viviendo en el código de Martu OS.

---

# 7. Audio — dos niveles

## V0 recomendada: Push-to-talk

- botón micrófono;
- grabar;
- transcribir;
- mandar texto al agente;
- respuesta en texto.

Ventajas:
- simple;
- robusto;
- mucho más barato;
- usa exactamente la misma memoria y tools que el chat escrito.

## Futuro: conversación de voz real

Usar OpenAI Realtime API, por ejemplo `gpt-realtime-2.1-mini` o `gpt-realtime-2.1`.

Permitiría:
- hablar sin botón;
- interrupciones;
- respuesta hablada;
- tool calling;
- experiencia tipo llamada con una compañera.

No hace falta para validar el producto.

---

# 8. Cómo “sabe qué hacer”

No sale de magia ni de entrenamiento.

La decisión final combina:

## Reglas determinísticas
Ejemplos:
- deadline <= 24 h;
- overdue;
- commitment vencido;
- status sin cambios durante N días.

## Datos
Ejemplos:
- qué servicios tiene el cliente;
- qué está pendiente;
- qué prometió Martu;
- qué dijo el cliente;
- qué rindió bien/mal.

## Instrucciones del agente
Ejemplos:
- priorizá compromisos reales;
- no reclames métricas si Martu no presta ese servicio;
- no inventes tareas;
- sé insistente sólo cuando corresponde.

## LLM
Interpreta lenguaje, cruza contexto, prioriza, propone y redacta.

Por eso:

> motor de reglas = “hay que intervenir”
>
> base de datos = “qué pasó”
>
> IA = “qué significa y cómo hablarle”

---

# 9. Aprendizaje de Martu

Después de algunas conversaciones se ejecuta un pequeño proceso de memoria.

Ejemplo:

Martu:
> “No me avises tres días antes por estas boludeces, con un día alcanza.”

El agente identifica una preferencia durable y propone/ejecuta:

`update_communication_profile(minor_task_lead_time=1 day)`

No se guarda cada frase como memoria.

Guardar principalmente:
- preferencias explícitas;
- hechos persistentes;
- decisiones;
- compromisos;
- aprendizajes por cliente.

---

# 10. Ejemplo completo

Martu habla:

> “El cliente dijo que no quiere más reels institucionales. Anotámelo, y el reel que falta lo termino mañana.”

1. Audio → transcripción.
2. IA recibe contexto Gavilán.
3. IA usa:
   - `save_client_memory("No quiere más reels institucionales")`
   - `create_commitment(reel pendiente, mañana)`
4. DB guarda ambas cosas.
5. Mañana scheduler consulta DB.
6. Reel sigue pendiente.
7. Scheduler crea evento.
8. IA redacta:
   > “Martu, el reel de Gavilán que dijiste que cerrabas hoy sigue pendiente.”
9. Web Push.
10. Martu toca la notificación.
11. Se abre Gavilán.
12. Dice:
   > “Pasalo al viernes.”
13. IA usa `reschedule_commitment`.
14. DB se actualiza.
15. Viernes vuelve a aparecer si no está resuelto.

Eso es la “jefa digital”.

---

# 11. Stack V0 recomendado

- **Next.js + TypeScript**
- **Vercel**
- **Supabase Postgres**
- **Supabase Cron / pg_cron**
- **Web Push + Service Worker + VAPID**
- **OpenAI Responses API**
- **GPT-5.6 Terra** para agente principal
- **GPT-4o Transcribe** para push-to-talk
- **pgvector** sólo cuando la cantidad de documentos lo justifique
- **Realtime API** después, no obligatorio V0

Variables aproximadas:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-5.6-terra`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `CRON_SECRET`
- variables de Supabase

Nunca exponer secretos en el frontend.


---

# ANEXO — DISCOVERY REAL DE MARTU

Usá estas transcripciones como fuente primaria para entender cómo trabaja la usuaria, qué problemas siente y cómo debe hablarle el producto.

No conviertas literalmente cada frase en una feature. Extraé el problema real y preservá el espíritu del producto.

# Audios de Martu

> Transcripciones copiadas y pegadas de varios audios. Pueden contener errores, frases cortadas o palabras mal transcritas.

## Audio 1

"Bueno, estaba pensando en base a lo que acabas de decir. Vos sos un crack absoluto. Yo no sé dónde va a terminar mi vida laboral, pero yo te quiero cerca siempre porque sos un crack. Lo que te iba a decir era que capaz podemos armar algo de automatización o algo que a mí me facilite la vida organizativa y laboral, ¿no? Y capaz es algo que si está bueno después lo podés vender. Pienso, no sé. 

O sea, hago un video... Contando qué es, lo que hacemos, le ponemos publicidad, generas la aplicación y la gente la compra o lo baja, no sé. O sea, después tendríamos que ver bien cuáles son como las debilidades de lo diario y qué oportunidades vemos para automatizar y que sea todo más organizado en un solo bloque, ¿no? 

Como todas cuestiones con los clientes, métricas, cuentas, publicidad, no sé, lo estoy pensando como medio en voz alta, guiones, como que yo, por ejemplo, si hay algo que veo, la edición es algo que no se va a suplantar con nada porque se usa el programa de editor, pero la otra cosa que pasa es que yo tengo que estar entrando constantemente a muchas plataformas para ver cosas, tipo a Drive para escribir los guiones, a Drive para ver el contenido, descargarlo, ir a edición, A Drive para planificar ideas de historias, de guiones. Después tengo que ir a WhatsApp para hablar con el cliente. A Instagram para ver métricas. A Meta para ver cosas de la publicidad. Al calendario de Trello para ir armando el calendario. Tipo, un mismo coso que me recuerde todo. Tipo, che, vos planificaste esto, a esta hora lo tenés que subir. O sea, yo sé que existen aplicaciones así, pero no sé si hay alguna que sea tan integral, que tenga también métricas, que tenga reportes, No sé, ¿qué opinas?"

## Audio 2

"Claro, o sea, hay ciertos clientes que hago todo el servicio integral, que es tipo subir historias, armar reels, grabar los reels, editarlos, ver la estrategia, ver la publicidad, pero a ninguno todavía le hago la publicidad sola, ¿me entendés? Ahora tengo varios que arrancan con la publicidad, pero lo tengo que todavía implementar. O sea, todavía no estoy con la publicidad del 100% de ninguno, pero voy a tener como 4 o 5 que sí. Así que nada, quería decir, sí, tengo que entrar a todas las cuentas de Instagram. Igual, por ejemplo, hay uno de los clientes, como que depende el cliente, depende las tareas que tengo. Porque hay algunos clientes que sí, es todo. Y hay otros clientes que solo, por ejemplo, hago contenido. No subo ni nada. O sea, solamente grabo y edito. O sea, escribo los guiones, grabo y edito. Entonces, es como que nada, habría que ver, tipo, bien qué cliente necesita qué tarea."

## Audio 3

"Tipo mi mayor desafío al mandarme a laburar sola es no tener el trabajo bajo presión como no voy a trabajar con alguien que me esté presionando como yo tengo en la agencia a Vicky que era mi líder me decía tipo necesitamos este vídeo para tal fecha me establecía el deadline y me controlaba todo o sea como yo no tengo esa persona estaría bueno tener una aplicación que simule a esa persona que sea como mi supervisor, ¿me entendés? Incluso se puede llamar algo así, como, no sé, jugar con eso también. Como que te hable como una persona real, es como tipo, che, bueno, pudiste con esto ya, y vos le tengas que responder. Uy, se me está escurriendo una, me levanté muy bien, muy creativa. Porque realmente yo siento como debilidad el hecho de laburar sola y de colgar, ¿me entendés? Y decir, bueno, me relajo. Y no, o sea, sí te podés relajar, pero mejor sería que lo tengas todo organizado y después te relajes."

## Audio 4

"O sea, realmente siento que es una debilidad tan grande de los freelancers esto que puede salir muy, muy piola. O sea, nada, igual sin presiones. O sea, lo podemos ir armando a poco. No lo hagas hoy. Disfruta el fin de semana porque te la pasas laburando. Pero nada, puede estar muy bueno."

## Audio 5

"Y te voy diciendo todas las cosas que tiene que tener o sea primero arrancar con bueno vos sos mi empleado tipo por ejemplo yo soy Martina yo hago tales y tales tareas para hacer tales y tales tareas tengo tales y tales clientes o sea para arrancar primer cliente tipo Norcel bueno Norcel justo no es un caso porque yo hago todo en presencial cuando voy no sé Gavilán que es mi cliente nuevo en Gavilán yo hago tal y tal y tal y tal y tal cosa Tipo hago CM, hago creación de contenido, historias, bla, bla, bla. 

Bueno, con esa información, lo siguiente sería que la aplicación te pida el brief del cliente. Y si no lo tenés, bueno, saber que está pendiente. O sea, está bien, no podés frenarte la aplicación si no tenés el brief, porque hay veces que no está el brief del cliente. Pero saber que queda pendiente y que se lo tenés que cargar tarde o temprano, porque vos sin un brief de un cliente no podés ejecutar una estrategia."

## Audio 6

"Bueno, después, si ya tiene estrategia, integrar la estrategia. Que la IA automáticamente vincule eso con el perfil de Instagram, vea la estrategia y sugiera mejoras para esa estrategia. Bueno, nada, y así con todos los clientes. O sea, todos los clientes tienen que tener el brief cargado, la estrategia cargada, la cuenta vinculada, de meta, de no sé qué, y sugerir constantemente mejoras para que se retroalimente."

## Audio 7

"No, no, es que ya me pone de lo roto que está en inglés. O sea, no te puedo explicar lo de lo roto que me pone. Igual, sí, o sea, yo probé una que era muy similar a esa, pero no... Hay mucha info que le faltaba. Tipo, yo no tenía nada para cargar el brief, no tenía nada para cargar de la estrategia, no tenía un ida y vuelta con la IA, o sea, no era así. Era tipo muy calendario, posteos, ¿qué tipo de posteo? Reel, no sé qué, no tenía nada de pauta, o sea... Después miro esta que vos me mandaste, porque capaz esta es más completa a la que me hiciste vos, pero la que yo me inscribí también era un mes sin tarjeta de crédito y después empezabas a pagar creo que 30 dólares por mes. La encontré por TikTok. Pero bueno, nada, para mí tiene que ser, por un lado, más humana en el sentido de esto de que haya una ida y vuelta con alguien que te está hablando, como pasa en una oficina real que te mandan por chat y es tipo, che, haceme tal cosa para ver a las tres. Y si no, te voy a estar hablando y rompiendo las pelotas porque no lo hiciste. ¿Me entendés? O sea, eso necesitamos, esa vuelta genuina. Porque si no, es como que a mí me pasa de que yo me descargo de aplicaciones y vos te tenés que meter a hacer todo. Y si vos no la retroalimentás, si vos no estás atrás de esa aplicación, no sirve de nada. Entonces quizás que esto sea como una vuelta de rosca de que haya un ida y vuelta constante entre la aplicación y vos."

## Audio 8

"O sea, sinceramente yo le veo mucho potencial porque Como que a todo lo que genera la IA, en definitiva, le termina faltando la parte humana para mí. O sea, hay cosas que están buenísimas de la IA, que son herramientas que te reayudan y todo, y en la parte organizativa, para todo lo que es redes sociales, es fundamental, como lo tienen las aplicaciones que ya existen. Pero para mí falta una ida y vuelta constante de alguien que, como tu co-equiper, ¿me entendés? Tu colega, tu placreativa. O sea, que sea como... Que sea eso, como, che, esto tiene que estar para hoy. Bueno, dale, lo hiciste. Che, mira, está esta tendencia para este cliente. Adaptala, adaptémosla, se me ocurrió tal cosa. Che, el ROAS de este anuncio en esta campaña está de tal forma. Hay que cambiar el presupuesto, hay que no sé qué mierda, hay que optimizar, hay que hacer un anuncio similar a este porque el hook le funcionó. O sea, siento que falta... Esa parte. Es ahí de vuelta. De que te sientas tipo acompañado."


---



# CANALES DE NOTIFICACIÓN — DISEÑAR PARA WHATSAPP, IMPLEMENTAR WEB PUSH EN V0

La arquitectura de proactividad debe separar claramente:

1. detección de que hay que intervenir;
2. generación del mensaje;
3. canal de entrega.

Crear una interfaz/abstracción tipo `NotificationProvider`.

Implementar en V0:
- `WebPushNotificationProvider`

Dejar preparada, documentada y fácil de agregar después:
- `WhatsAppNotificationProvider`

NO implementar todavía la integración real con WhatsApp si eso pone en riesgo el one-shot o exige configuración externa/manual de Meta.

El objetivo futuro es que Martu pueda recibir algo como:

> Martu OS: Gavilán vence mañana y el tercer guion sigue abierto. ¿Lo pasamos o lo cerrás hoy?

y responder por WhatsApp:

> pasalo al viernes

para que el webhook entrante:
- identifique a Martu;
- envíe el mensaje al mismo agente/orquestador;
- ejecute las mismas tools;
- actualice la misma DB;
- responda por WhatsApp.

La lógica de negocio NO debe estar acoplada a Web Push. Web, audio y futuro WhatsApp deben terminar usando el mismo:
- contexto;
- memoria;
- agente;
- tools;
- base de datos.

Documentar en README la ruta futura de integración con WhatsApp Business Platform / Cloud API, webhooks y mensajes proactivos/templates, pero no falsificar que está conectada.


# ORDEN DE PRIORIDAD SI HAY CONFLICTOS

1. Proactividad real.
2. Todo el contexto de cada cliente en un solo lugar.
3. Servicios variables por cliente.
4. IA contextual con memoria persistente.
5. Audio push-to-talk.
6. UX/UI de alta calidad.
7. Datos demo coherentes y cruzados.
8. Features secundarias.

Si tenés que elegir entre ampliar scope o hacer mejor el corazón del producto, elegí el corazón.

## RESULTADO ESPERADO

Quiero poder mostrarle la V0 a Martu y que pueda:

- entrar sin explicación;
- entender qué tiene que hacer hoy;
- entrar a Gavilán y ver todo el mundo del cliente;
- encontrar guiones, ideas, notas, reuniones, tareas, estrategia y contenido;
- hablarle por micrófono a la IA;
- decir “mañana termino el tercer reel” y que eso se convierta en compromiso real;
- recibir luego un recordatorio proactivo sin tener la web abierta;
- responder “pasalo al viernes” y que el sistema actualice la DB;
- notar que Luma no tiene métricas ni pauta porque ese servicio no existe;
- sentir que la IA sabe quién es Martu y qué pasa con cada cliente.

Si eso funciona y se ve como un producto real, la V0 cumplió su objetivo.
