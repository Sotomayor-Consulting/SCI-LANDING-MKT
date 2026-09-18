# Integracion de leads: Supabase, n8n y Odoo

## Arquitectura recomendada

Supabase conserva el registro maestro. n8n traduce eventos y aplica cambios en Odoo. Odoo no debe
actualizar Supabase salvo mediante un flujo inverso explicito; de lo contrario aparecen dos fuentes
de verdad para `status`.

Los productores no deben recibir la `service_role`. Landings y plataformas llaman a un endpoint de
ingesta autenticado y limitado por tasa; ese endpoint valida y escribe en `public.leads`. Cada
productor genera un `submission_id` y reutiliza el mismo UUID en todos sus reintentos. El default de
la base solo cubre inserciones que no traen UUID, no hace idempotente un reintento externo.

### Riesgos y decisiones

| Tema | Decision |
| --- | --- |
| Entrega del webhook | `pg_net` es asincrono, pero no garantiza reintento ni entrega durable. Crear un workflow de reconciliacion que consulte pendientes. |
| Duplicados en Odoo | Crear en `crm.lead` un campo tecnico `x_submission_id` con restriccion unica obligatoria. Buscarlo antes de crear y, ante conflicto, releerlo. El indice parcial de Supabase no evita una carrera ocurrida antes del feedback. |
| Bucles | Un PATCH de n8n genera otro `UPDATE`. El detector de cambios termina inmediatamente si solo cambiaron `odoo_lead_id`, `odoo_sync_status`, `odoo_sync_error`, `odoo_synced_at` o `updated_at`. |
| Orden de eventos | El webhook es solo una notificacion. El procesador relee la fila actual de Supabase antes de escribir Odoo para que un evento atrasado no restaure datos antiguos. |
| Autenticacion | El Webhook de n8n usa Header Auth con `X-Webhook-Secret`. Las credenciales de Supabase y Odoo viven en Credentials/Secrets, nunca en nodos Code. |
| PII | No guardar ejecuciones exitosas. Limitar las fallidas a 7 dias, restringir Execution Data a operadores y verificar el pruning. El payload contiene email y telefono completos. |
| Telefono | La concatenacion actual es una validacion minima. Para varios paises, normalizar con libphonenumber en la capa de ingesta. |
| UTMs | Supabase guarda el valor original. n8n descarta solo el valor invalido al construir el payload para Odoo y registra una advertencia. |
| Email | No es unico intencionalmente: una misma persona puede generar oportunidades distintas. `submission_id` es la llave de idempotencia. |

Para mayor volumen, agregar `odoo_sync_attempts`, `odoo_last_attempt_at` y
`odoo_next_retry_at`, y usar un outbox durable. No se incluyeron en la primera migracion para mantener
el contrato solicitado.

La implementacion agrega `source_version` y `odoo_synced_version`. Todo cambio de negocio incrementa
la primera y vuelve el lead a `pending`; los PATCH de metadatos de n8n no la incrementan. Esto permite
reconciliar tambien UPDATE perdidos, no solo INSERT perdidos.

## SQL de Supabase

Para ejecutarlo manualmente desde el SQL Editor, usa los dos scripts de `supabase/scripts` en orden.
Las migraciones equivalentes estan en `supabase/migrations` para despliegues versionados.
La primera hace que el historial tambien funcione sobre una base nueva; la segunda evoluciona una
tabla existente al esquema final y crea los triggers. Antes de ejecutar la segunda, reemplazar:

- `REPLACE_WITH_WORKFLOW_ID` por el path de produccion de n8n.
- `REPLACE_WITH_N8N_WEBHOOK_SECRET` por un secreto aleatorio largo que coincida con la credencial
  Header Auth de n8n.

El script de esquema habilita RLS sin politicas para `anon` ni `authenticated`, revoca sus privilegios y
concede acceso a `service_role`. Es el modelo correcto para la Pages Function actual. Si en el futuro
se permite insercion directa desde el navegador, no exponer `service_role`: crear una politica de
solo `INSERT`, aplicar Turnstile/rate limiting y mantener `SELECT`, `UPDATE` y `DELETE` denegados.

El secreto del header queda como argumento del trigger y, por tanto, como texto en la definicion SQL.
Para una instalacion endurecida, sustituir el Database Webhook por una funcion trigger propia basada
en `net.http_post` que lea URL y secreto desde Vault. Esa variante cambia el requisito de usar
directamente `supabase_functions.http_request`, pero evita guardar el secreto en la migracion.

Antes de desplegar el trigger, comprobar que existe
`supabase_functions.http_request` despues de habilitar `pg_net`. Es una funcion administrada por
Supabase y puede no existir en una instalacion PostgreSQL/self-hosted incompleta.

## Cloudflare Pages Function

El endpoint de confirmacion esta en `functions/api/calendar-confirmation.ts` y se publica como:

```text
POST /api/calendar-confirmation
```

Variables requeridas:

| Variable | Tipo |
| --- | --- |
| `SUPABASE_URL` | Variable |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret |
| `CALENDAR_WEBHOOK_SECRET` | Secret |

Contrato de entrada:

```http
POST /api/calendar-confirmation
Content-Type: application/json
X-Webhook-Secret: <secret>

{
  "submission_id": "bf8fe4ef-3d38-48b9-a3aa-ce27b7937af1",
  "scheduled_at": "2026-09-15T14:00:00-04:00",
  "calendar_event_id": "event_123"
}
```

La funcion limita el body a 1 KiB, compara el secreto en tiempo constante, valida UUID/fecha/evento,
reintenta PATCH idempotentes en errores transitorios, no envia `updated_at` y usa
`Prefer: return=representation` para distinguir un lead inexistente y devolver 404.

La landing envia `submission_id` como la respuesta personalizada `a4` de ZCal. Configurar esa quinta
pregunta/campo tecnico en ZCal y mapearla a `submission_id` en el webhook. Para Calendly o Cal.com,
crear el equivalente como campo oculto/metadata; si el proveedor no reenvia metadata arbitraria,
usar una tabla de correlacion creada antes de abrir el calendario. No correlacionar solo por email.

Cuando Calendly, Cal.com o ZCal ofrezcan firma HMAC nativa, validarla sobre los bytes crudos del body
en lugar del secreto compartido generico. Guardar tambien el ID del evento permite deduplicar
reintentos; si se necesita historial de reprogramaciones/cancelaciones, usar una tabla separada
`lead_calendar_events` en vez de sobrescribir solo dos columnas.

La ingesta publica existente es `POST /api/leads`. Antes de exponerla a trafico pagado, verificar un
token de Cloudflare Turnstile en servidor y aplicar una regla de rate limiting en Cloudflare. El
honeypot actual es una defensa complementaria, no autenticacion. Integraciones servidor-servidor
deben usar credenciales distintas por productor o firmas HMAC; ninguna recibe `service_role`.

## Workflow principal de n8n

### Configuracion previa de Odoo

1. Crear el campo tecnico `x_submission_id` en `crm.lead`.
2. Hacerlo indexado y unico mediante un modulo Odoo si la version/Studio no permite la restriccion.
3. Crear o identificar los IDs de etapas para `new`, `contacted`, `qualified`, `scheduled`, `won`,
   `lost` y `spam`. No asumir que el nombre de una etapa es unico entre equipos comerciales.
4. Guardar el mapa `status -> stage_id`, equipo comercial, usuario responsable y tipo de actividad
   en variables/credenciales del workflow, no en datos del lead.
5. Configurar una credencial Odoo dedicada con permisos minimos sobre `crm.lead`, `utm.source`,
   `utm.medium`, `utm.campaign` y `mail.activity`.

### Secuencia de nodos

1. **Webhook - Supabase Lead Event** (`Webhook`): metodo POST, path de produccion y credencial Header
   Auth `X-Webhook-Secret`. Usar respuesta inmediata (`On Received`) para que el timeout de 5 segundos
   de `pg_net` no dependa de la latencia de Odoo.
2. **Validate Envelope** (`Code`): aceptar solo `schema === "public"`, `table === "leads"`, y
   `type` en `INSERT|UPDATE`. Verificar que `record.submission_id` sea UUID. Lanzar error para payloads
   invalidos.
3. **Event Type** (`Switch`): separar `INSERT` y `UPDATE`. La rama UPDATE calcula si el cambio fue
   solo de sincronizacion; ambas ramas terminan llamando al mismo procesador con
   `{submission_id, type, record, old_record}`.
4. **Process Current Lead** (`Execute Sub-workflow`): subworkflow comun que recibe la notificacion,
   vuelve a leer Supabase por `submission_id` y usa esa fila actual como unica entrada para Odoo. La
   respuesta HTTP inmediata solo confirma recepcion por n8n, no sincronizacion completada.

Configurar inicialmente concurrencia global 1 para el procesador. Esto serializa escrituras y evita
que una ejecucion vieja termine despues de una nueva. Si el volumen vuelve esto un cuello de botella,
reemplazarlo por una cola con particion/lock por `submission_id`, no por concurrencia libre.

### Rama INSERT

5. **Fetch Current Lead** (`HTTP Request`, Supabase): seleccionar una sola fila por `submission_id`.
   Si no existe, terminar con error de integridad. No procesar directamente el snapshot del webhook.
6. **Already Linked?** (`If`): si hay `odoo_lead_id` o `odoo_sync_status === "synced"`, no crear;
   pasar a la ruta de actualizacion.
7. **Find Lead by Submission** (`Odoo` o `HTTP Request`): buscar `crm.lead` con dominio
   `[["x_submission_id", "=", submission_id]]`, limite 1. Este lookup es obligatorio aunque
   Supabase todavia diga `pending`.
8. **Odoo Lead Exists?** (`If`): si existe, conservar su ID y saltar la creacion. Actualizar el link
   en Supabase al final.
9. **Validate and Resolve UTMs** (`Execute Sub-workflow`): enviar siempre un item base con las tres
   UTMs. El subworkflow devuelve exactamente un objeto con `source_id`, `medium_id` y `campaign_id`
   anulables, aunque no haya ninguna UTM valida. Registrar descartes con `submission_id` y nombre del
   campo, nunca email o telefono.
10. **Build CRM Lead** (`Set` o `Code`): construir solo campos aceptados por Odoo:

```json
{
  "name": "{name} - {activity}",
  "contact_name": "{name}",
  "email_from": "{email}",
  "phone": "{phone_normalized}",
  "description": "Asesoria: {advice}\n\nPregunta: {question}",
  "campaign_id": "{campaign_id o false}",
  "source_id": "{source_id o false}",
  "medium_id": "{medium_id o false}",
  "type": "lead",
  "x_submission_id": "{submission_id}"
}
```

11. **Create CRM Lead** (`Odoo` o `HTTP Request`): crear `crm.lead` y conservar el ID devuelto. No
    enviar claves UTM cuyo valor sea invalido; en Odoo, los Many2one vacios suelen representarse como
    `false`, no como una cadena vacia.
12. **Mark Synced** (`HTTP Request`, Supabase): PATCH por `submission_id=eq.<uuid>` y
    `source_version=eq.<version_leida>` con
    `odoo_lead_id`, `odoo_sync_status: "synced"`, `odoo_synced_at: now()` y
    `odoo_sync_error: null`, ademas de `odoo_synced_version: <version_leida>`. Exigir
    `return=representation`: cero filas significa que el lead cambio durante el proceso y debe quedar
    pendiente para reconciliacion. Usar la credencial server-side de Supabase.

### Subworkflow Resolve Odoo UTM

13. **UTM Input** (`Execute Workflow Trigger`): recibe las tres UTMs y conserva un item base durante
    toda la ejecucion. El subworkflow asigna internamente modelos desde una allowlist; nunca acepta un
    modelo arbitrario del webhook.
14. **Find Exact Name** (`Odoo` o `HTTP Request`): `search_read` por
    `[["name", "=", value]]`, campos `id,name`, limite 1.
15. **Found?** (`If`): conservar el ID existente.
16. **Create UTM** (`Odoo` o `HTTP Request`): crear `{name: value}` cuando falte. Al final devolver
    un solo objeto con los tres IDs.

Con ejecuciones paralelas, dos leads pueden intentar crear el mismo UTM. Serializar este subworkflow
o imponer unicidad en Odoo. Un cache en n8n reduce llamadas, pero no sustituye la restriccion.

### Reglas UTM

Elegir `_` como separador canonico.

| Campo | Regla |
| --- | --- |
| `utm_source` | Allowlist: `google`, `facebook`, `instagram`, `linkedin`, `tiktok`, `newsletter`, `facebook_organic`, `linkedin_organic` |
| `utm_medium` | Allowlist: `cpc`, `paid_social`, `email`, `organic`, `referral`, `cpm` |
| `utm_campaign` | `^[a-z0-9]+(_[a-z0-9]+)+$` |

Para cualquier nombre que n8n vaya a crear, aplicar primero `^[a-z0-9_-]+$`. No transformar de forma
silenciosa un valor invalido porque cambiaria la atribucion; registrar advertencia y omitir ese
Many2one. `utm_content` y `utm_term` no tienen campos relacionales estandar en `crm.lead`: incluirlos
en `description` o crear campos personalizados si se necesitan en reportes.

### Rama UPDATE

17. **Detect Changes** (`Code`): comparar con igualdad estricta cada campo de `record` y
    `old_record`. Generar flags `syncOnly`, `scheduledTransition`, `statusChanged`,
    `contactChanged` y `utmChanged`.
18. **Sync-only?** (`If`): si solo cambiaron campos `odoo_*` y `updated_at`, terminar sin PATCH. Esto
    corta el loop producido por **Mark Synced** o **Mark Failed**.
19. **Fetch Current Lead** (`HTTP Request`, Supabase): releer el estado canonico. Si el evento de
    calendario indica null -> fecha y el estado actual no es `won`, `lost` ni `spam`, hacer primero
    un PATCH de `status: "scheduled"` en Supabase y usar ese estado efectivo para Odoo. Los estados
    terminales conservan su etapa aunque se registre una cita.
20. **Ensure Odoo Link** (`If` + lookup): usar `odoo_lead_id`; si falta, buscar
    `x_submission_id`. Si tampoco existe, ejecutar la rama INSERT una sola vez.
21. **Resolve Changed UTMs** (`Execute Sub-workflow`): validar y resolver de nuevo solo si cambio una
    UTM relacional.
22. **Build Update Values** (`Code`): combinar en un unico `write` los datos actuales. Mapear
    `status` al `stage_id` configurado. Si una UTM cambio a null o es invalida, enviar explicitamente
    `false` para limpiar el Many2one anterior en Odoo.
23. **Update CRM Lead** (`Odoo` o `HTTP Request`): escribir una sola vez en `crm.lead`.
24. **Create Scheduled Activity** (`Odoo` o `HTTP Request`): solo para la transicion null -> fecha,
    crear `mail.activity` asociada a `crm.lead`, con tipo llamada/reunion, fecha limite y resumen que
    incluya `calendar_event_id`. Requerir un campo externo unico en la actividad basado en
    `calendar_event_id`; ante conflicto, releer/actualizar la actividad existente. Una busqueda previa
    o una nota de chatter por si solas no garantizan idempotencia.
25. **Mark Update Synced** (`HTTP Request`, Supabase): limpiar error, conservar el ID y actualizar
    `odoo_synced_at`. El siguiente webhook sera sync-only y terminara en el paso 17.

No usar un `Switch` exclusivo para `scheduledTransition`, `statusChanged` y `contactChanged`: un solo
UPDATE puede contener los tres cambios. Calcular un payload combinado evita perder actualizaciones.

### Errores y reintentos

26. Activar `Retry On Fail` en lecturas/escrituras de Odoo y Supabase para 429, timeout y 5xx. Si la
    version de n8n no ofrece backoff exponencial real, encapsular la llamada en un subworkflow con
    `Loop Over Items` + `Wait`: 2 s, 4 s y 8 s, con jitter. No reintentar errores 4xx de validacion.
27. Conectar el Error Output de los nodos criticos a **Format Sync Error** (`Code`), truncando el
    mensaje a 4000 caracteres y eliminando secretos.
28. **Classify Failure** (`Switch`): timeout, 408, 429 y 5xx son transitorios y pasan por los tres
    reintentos. Un 4xx de validacion/configuracion es terminal y se marca `skipped`. Tras agotar un
    error transitorio, marcar `failed` y alertar.
29. **Mark Failed/Skipped** (`HTTP Request`, Supabase): PATCH por `submission_id` con el estado y un
    `odoo_sync_error` sanitizado. Su webhook de retorno sera sync-only.
30. Crear un workflow global con **Error Trigger** -> **Redact Error** -> **Slack/Email**. Incluir
    workflow, execution URL, submission ID y nodo; excluir el payload PII y credenciales.

## Workflow de reconciliacion

Crear un segundo workflow porque el Database Webhook no es una cola durable:

1. **Schedule Trigger** cada 5 minutos.
2. **Fetch Unsynced Leads** (`HTTP Request`, Supabase): obtener lotes ordenados por `created_at` donde
   `odoo_synced_version` sea null o distinta de `source_version`, excluyendo `skipped`. Para la primera
   version, los `failed` requieren revision y cambio explicito a `pending`; al agregar intentos y
   `next_retry_at`, podran reintentarse automaticamente con limite.
3. **Loop Over Items** con concurrencia limitada.
4. **Execute Process Current Lead**, enviando `{submission_id, type: "RECONCILE"}`. El subworkflow
   relee Supabase y reutiliza la misma logica idempotente.
5. Alertar si un lead sigue pendiente mas de un umbral acordado.

Para robustez estricta, evolucionar esta reconciliacion a un outbox transaccional con intentos,
`next_retry_at` y claim atomico mediante `FOR UPDATE SKIP LOCKED`.

## Despliegue

1. Crear el campo unico de Odoo, las credenciales y los workflows principal, procesador,
   reconciliacion y error global, inicialmente inactivos. Crear tambien el campo externo unico de
   actividad para `calendar_event_id`.
2. Probar manualmente el payload INSERT y UPDATE en n8n, incluidos UTM invalido, reintento duplicado,
   agendamiento y fallo de Odoo.
3. Activar el procesador, el webhook principal, la reconciliacion y el workflow de error. Copiar la
   URL de produccion `/webhook/<id>`; nunca usar `/webhook-test/` en Supabase.
4. Reemplazar los dos placeholders de la migracion por el ID de produccion y el mismo Header Auth
   secret configurado en n8n.
5. Ejecutar las migraciones de `supabase/migrations` en orden o desplegarlas con el flujo habitual de
   Supabase. Verificar antes que el SQL ya no contenga `REPLACE_WITH_`. La segunda migracion aborta
   con un conteo si hay datos legacy invalidos o IDs duplicados; corregirlos y reintentar, no eliminar
   constraints para forzar el despliegue.
6. Configurar en Cloudflare `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y
   `CALENDAR_WEBHOOK_SECRET`, y desplegar Pages.
7. Configurar Turnstile server-side y una regla de rate limiting para `/api/leads`; probar rechazo de
   token ausente/invalido y exceso de tasa antes de enviar trafico. Configurar el proveedor de
   calendario para llamar a `/api/calendar-confirmation` con su secreto o firma HMAC.
8. Insertar un lead de prueba con UUID fijo. Confirmar fila `pending`, ejecucion n8n, lead unico en
   Odoo y feedback `synced` con `odoo_lead_id`.
9. Repetir exactamente el mismo `submission_id`. Confirmar que no se crea un segundo lead Odoo.
10. Enviar un UPDATE de calendario. Confirmar etapa, actividad y ausencia de loop.
11. Simular indisponibilidad de Odoo. Confirmar `failed` y alerta; revisar el error, cambiarlo a
    `pending` y confirmar recuperacion por reconciliacion.
12. Revisar periodicamente `net._http_response`, ejecuciones fallidas de n8n y politicas de retencion
    de PII.
13. En n8n, desactivar el guardado de ejecuciones exitosas, fijar pruning de fallidas a 7 dias y
    comprobar con una ejecucion de prueba que solo operadores autorizados acceden a Execution Data.

## Fuentes tecnicas

- Supabase Database Webhooks: https://supabase.com/docs/guides/database/webhooks
- Supabase `pg_net`: https://supabase.com/docs/guides/database/extensions/pg_net
- Supabase RLS y Data API: https://supabase.com/docs/guides/api/securing-your-api
- Supabase Vault: https://supabase.com/docs/guides/database/vault
