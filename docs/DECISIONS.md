# Decisiones de producto y arquitectura — V0

## Producto

- Gavilán se modela como una marca de turismo de cercanía con servicio integral.
  Los conceptos, datos y memoria usan el mismo mundo: escapadas, Laguna de los
  Patos, piezas institucionales y el experimento de videos más cortos.
- `Mi día` prioriza compromisos explícitos antes que urgencias inferidas. Una
  promesa hecha ayer puede desplazar una tarea de mayor valor pero no prometida.
- Los tabs, workflows, reglas, tools y contexto de IA se derivan de una sola
  matriz de capacidades por servicio. Ocultar una pestaña no alcanza: también se
  validan mutaciones y nudges en backend.
- Las hipótesis de métricas se redactan como asociaciones a probar, nunca como
  causalidad demostrada.
- Las integraciones externas tienen estados honestos: demo o no conectado.

## Técnica

- Next.js App Router concentra UI y backend serverless para reducir piezas de la
  V0 y permitir deploy directo en Vercel.
- Supabase Postgres es la única base de producción. PGlite persiste localmente y
  permite desarrollar/testear sin Docker; producción nunca cae a este fallback.
- No se agrega pgvector al camino crítico: cliente/categoría/FTS/recencia alcanzan
  para este volumen. El recuperador semántico queda desacoplado para una V1.
- Supabase Cron despierta un endpoint idempotente cada minuto. El motor de reglas
  decide si intervenir; la IA sólo interpreta/redacta; el provider entrega.
- Templates de alta calidad redactan nudges simples. No se paga una llamada LLM
  para cada tick.
- Web, audio y futuro WhatsApp entran al mismo orquestador y dispatcher de tools.
- `gpt-5.6-terra` es el default del agente y `gpt-4o-transcribe` el de audio, pero
  la V0 completa se puede recorrer en modo demo sin una clave.

## Límites deliberados

- Login falso, sin multiusuario.
- Sin conexión real a Instagram, Meta, Drive, Calendar, Meet o WhatsApp.
- Sin conversación de voz de salida ni Realtime en V0.
- El smoke test de cron/Vault y la notificación nativa final requieren un proyecto
  Supabase/Vercel y permiso del navegador; la suite local usa reloj y provider de
  notificaciones inyectables además de probar el Service Worker real.
