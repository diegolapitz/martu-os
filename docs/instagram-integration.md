# Instagram real V0.1

Estado: implementada y cubierta con mocks. La integración **no se considera validada contra Instagram real** hasta completar el smoke test con una cuenta Professional autorizada.

## Decisión de plataforma

Se usa **Instagram API with Instagram Login / Business Login for Instagram**. Es la vía oficial adecuada para este alcance porque permite que cuentas profesionales Business o Creator autoricen directamente a Martu OS y no exige vincular una Facebook Page. No permite cuentas personales, Ads ni tagging.

- Graph API fijada por defecto: `v26.0` (publicada el 29 de julio de 2026). Se puede cambiar con `INSTAGRAM_GRAPH_VERSION` después de revisar el changelog.
- Host de datos: `https://graph.instagram.com`.
- Authorization: `https://www.instagram.com/oauth/authorize`.
- Intercambio de authorization code: `POST https://api.instagram.com/oauth/access_token`.
- Token long-lived: `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token`.
- Renovación: `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token`.
- Perfil: `GET /v26.0/me`.
- Media paginada: `GET /v26.0/{ig-user-id}/media`.
- Insights de cuenta/media: `GET /v26.0/{id}/insights`.

Fuentes oficiales consultadas:

- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Instagram Insights](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/insights)
- [Instagram User media edge](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/media)
- [Instagram Media insights](https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-media/insights)
- [Graph API versions/changelog](https://developers.facebook.com/docs/graph-api/changelog/versions)
- [Colección oficial de Instagram mantenida por Meta](https://www.postman.com/meta/instagram/overview)

Meta puede modificar métricas y requisitos sin esperar una nueva versión. Antes de subir de versión hay que revisar también el [changelog de Instagram Platform](https://developers.facebook.com/docs/instagram-platform/changelog).

## Permisos mínimos

Martu OS pide únicamente:

- `instagram_business_basic`: identidad de la cuenta profesional y media propia.
- `instagram_business_manage_insights`: insights disponibles de la cuenta y de su media.

No se solicitan permisos de publicación, mensajes, comentarios, Ads ni Facebook Pages. Los scopes antiguos `business_basic` y relacionados quedaron deprecados el 27 de enero de 2025 y no se usan.

Con **Standard Access**, el flujo sirve para cuentas profesionales propias/administradas por el desarrollador y agregadas a la app. Para conectar cuentas arbitrarias de clientes se necesita **Advanced Access**, App Review vigente y los requisitos de negocio/verificación que Meta muestre en el Dashboard.

## Configuración manual en Meta Developer Dashboard

1. Crear o abrir una app de tipo Business en [Meta for Developers](https://developers.facebook.com/apps/).
2. Agregar el caso de uso “Instagram API with Instagram Login” (en algunas interfaces aparece como “API setup with Instagram login”).
3. Copiar el **Instagram App ID** y **Instagram App Secret** de ese producto, no las credenciales de Facebook Login.
4. En Business Login settings, registrar exactamente estas OAuth redirect URIs:
   - desarrollo: `http://localhost:3000/api/instagram/oauth/callback`
   - producción: `https://martu-os.vercel.app/api/instagram/oauth/callback`
5. Habilitar los permisos `instagram_business_basic` e `instagram_business_manage_insights`.
6. Mantener la app en Development/Standard Access para el smoke inicial.
7. Agregar la cuenta Instagram Professional controlada como tester/rol permitido por la app y aceptar la invitación desde la cuenta si Meta lo solicita.
8. Configurar en Vercel las variables del apartado siguiente y redesplegar.

Una cuenta personal/consumer no es compatible. Hay que convertirla manualmente a Creator o Business desde Instagram; Martu OS nunca lo hace automáticamente.

## Variables de entorno

Todas son server-only:

```text
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_GRAPH_VERSION=v26.0
INSTAGRAM_REDIRECT_URI=https://martu-os.vercel.app/api/instagram/oauth/callback
INSTAGRAM_TOKEN_ENCRYPTION_KEY=
INSTAGRAM_OAUTH_STATE_SECRET=
```

Generar dos valores distintos y aleatorios para las últimas variables, por ejemplo con `openssl rand -base64 32`. La clave de token debe decodificar a 32 bytes. Guardarlas sólo en `.env.local` y Vercel; no rotar `INSTAGRAM_TOKEN_ENCRYPTION_KEY` sin un procedimiento de re-cifrado o reconexión.

## Seguridad y almacenamiento

- El callback, sync, desconexión y vinculación vuelven a exigir la sesión Martu.
- El `state` OAuth es aleatorio, firmado con HMAC, dura 10 minutos y se guarda en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción.
- El access token long-lived se cifra con AES-256-GCM y un nonce aleatorio antes de llegar a PostgreSQL.
- Ningún DTO, respuesta HTTP, log o mensaje de UI contiene el token.
- Las tablas tienen RLS habilitado sin políticas públicas; el backend accede con `DATABASE_URL`.
- Errores de Meta se convierten a categorías seguras. Los logs sólo registran etapa, código/status, conteos y duración.
- Al desconectar se elimina el token cifrado local y se conserva el historial. El usuario también puede revocar la app desde la configuración de Instagram/Meta.

Los tokens long-lived suelen durar alrededor de 60 días. Un token vigente puede renovarse después de tener al menos 24 horas; Martu OS intenta renovarlo cuando quedan menos de 7 días. Un token expirado o revocado pasa la conexión a `needs_reauth`.

## Modelo de datos

La migración `202609020002_instagram_integration.sql` agrega:

- `instagram_connections`: una conexión por cliente, cuenta, token cifrado, expiración, scopes y estado de sync.
- `instagram_media`: media deduplicada por `(connection_id, instagram_media_id)` y vínculo opcional a `content_items`.
- `instagram_media_insights`: pares flexibles `metric_name` + `metric_value jsonb` + `period`.
- `instagram_account_insights`: serie flexible para métricas de cuenta.

El sync es idempotente mediante `ON CONFLICT`, pagina hasta 20 páginas de 100 elementos, limita insights a cuatro piezas concurrentes y bloquea dos syncs simultáneos de la misma conexión. Un lock abandonado se puede recuperar después de 10 minutos.

El auto-match sólo ocurre si ya existe una `publication` de plataforma Instagram con el mismo `external_id`. El resto se vincula manualmente desde Métricas.

## Métricas y limitaciones

Se consultan métricas documentadas por Meta según el tipo de media. La base común es `views`, `reach`, `likes`, `comments`, `saved`, `shares` y `total_interactions`; para reels se prueban además watch time promedio/total y `reels_skip_rate`. Si un lote incluye una métrica no soportada, el cliente divide la consulta para conservar las métricas válidas y omite sólo la no disponible.

- Un valor ausente se muestra como “Sin dato”, nunca como cero inventado.
- Algunas métricas de cuenta exigen al menos 100 seguidores.
- Los insights de cuenta se conservan por un período limitado (Meta documenta hasta 90 días para varios User Metrics).
- Tipos de media y cuentas distintas pueden devolver conjuntos diferentes.
- URLs de media/perfil alojadas por Meta pueden expirar; `permalink` es la referencia durable.
- Sumas de alcance entre piezas no equivalen a alcance único de cuenta y se rotulan como acumuladas.
- Todo lo proveniente de estas tablas llega a la Supervisora como dato `observed` y `source=instagram_api`; una hipótesis nunca se presenta como causalidad.

## Flujo y smoke test real

1. Abrir `Clientes → Gavilán → Métricas`.
2. Pulsar **Conectar** y completar login/consentimiento en Instagram.
3. Verificar el callback, avatar/username, estado conectado y primera sincronización.
4. Confirmar publicaciones reales e insights; abrir una pieza y su permalink.
5. Recargar: la conexión debe persistir.
6. Pulsar **Sincronizar ahora** dos veces de forma secuencial: no debe duplicar media.
7. Vincular una pieza a un contenido interno, recargar y verificar el vínculo.
8. Desconectar, confirmar que el historial queda y volver a conectar.

No ejecutar este smoke sin autorización explícita para usar una cuenta Professional controlada. No hay auto-sync ni Cron en V0.1; la actualización es manual para mantener bajo el consumo y simplificar la validación inicial.
