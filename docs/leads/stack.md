# Integración de Leads: Supabase → n8n → Odoo

> [!tip] Cómo ver correctamente esta nota en Obsidian
> Las tablas y los callouts se renderizan en **Live Preview** o **Reading view**. Si estás en
> **Source mode**, verás los caracteres `|` y `>` como texto, aunque la sintaxis sea correcta.
> Cambia el modo con `Ctrl + E` o selecciona **Reading view** en el menú de los tres puntos de la
> nota.

> [!note] Sintaxis compatible
> Las tablas de esta nota usan la sintaxis Markdown oficial de Obsidian: una fila de encabezado, una
> fila separadora con al menos tres guiones por columna y filas con el mismo número de columnas.
> No pegues las tablas dentro de un bloque de código con ```.

> [!info] Propósito
> Documentación técnica de la integración multi-plataforma de leads. Supabase es la fuente de
> verdad primaria, n8n es el orquestador y Odoo CRM es el consumidor downstream.

## 1. Resumen de arquitectura

```text
[Facebook Ads / Google Ads / LinkedIn / TikTok]
                         │
[Landings / formularios / agentes de marketing]
                         │
                         ▼
            [Cloudflare Pages Function]
                         │
                         ▼
              [Supabase: public.leads]
                Fuente de verdad primaria
                         │
              AFTER INSERT / UPDATE
                         │ pg_net HTTP POST
                         ▼
                 [n8n producción]
              Orquestador y traductor
                         │
                         ▼
                  [Odoo CRM]
       crm.lead + etapas + relaciones UTM
```

### Responsabilidad de cada tecnología

| Tecnología | Responsabilidad | No debe hacer |
|---|---|---|
| Cloudflare Pages Function | Validar formularios, Turnstile, normalizar y guardar leads | Ser la fuente de verdad o escribir directamente en Odoo |
| Supabase | Persistir el histórico completo, idempotencia, auditoría y eventos | Depender de Odoo para conservar un lead |
| pg_net | Notificar a n8n después de cambios | Ser considerado una cola durable con entrega garantizada |
| n8n | Leer el estado canónico, resolver UTMs, crear/actualizar Odoo y reportar resultado | Crear duplicados o procesar snapshots obsoletos sin releer Supabase |
| Odoo | Gestionar oportunidades, etapas, actividades y seguimiento comercial | Ser el maestro de los datos originales de marketing |

## 2. Flujo completo

### 2.1 Captura de un lead

1. Un usuario llega desde una campaña o plataforma externa.
2. La landing conserva los parámetros `utm_*`, `gclid` y `fbclid`.
3. El formulario genera un `submission_id` UUID.
4. Cloudflare valida el contenido, Turnstile y límites de abuso.
5. Cloudflare hace `POST` a Supabase REST con la misma `submission_id`.
6. Supabase inserta una fila en `public.leads`.
7. El trigger de Supabase envía un evento HTTP a n8n.
8. n8n vuelve a leer la fila actual desde Supabase.
9. n8n busca `x_submission_id` en Odoo.
10. Si no existe, resuelve UTMs y crea `crm.lead`.
11. n8n actualiza Supabase con `odoo_lead_id` y estado `synced`.

### 2.2 Reintento del mismo lead

El productor debe reutilizar el mismo UUID. Supabase tiene un índice único sobre
`submission_id`, por lo que el reintento no crea otra fila.

La idempotencia completa requiere dos capas:

```text
Supabase: unique(submission_id)
Odoo:     unique(crm.lead.x_submission_id)
```

La búsqueda previa en n8n mejora el flujo, pero no reemplaza la restricción única de Odoo porque dos
ejecuciones concurrentes podrían hacer `search → no existe → create` al mismo tiempo.

### 2.3 Agendamiento

1. El calendario recibe el `submission_id` como metadata o respuesta personalizada.
2. El proveedor llama a `POST /api/calendar-confirmation`.
3. Cloudflare valida el secreto/firma, UUID, fecha y evento.
4. Cloudflare actualiza únicamente `scheduled_at` y `calendar_event_id`.
5. El trigger de `updated_at` incrementa `source_version` y vuelve el lead `pending`.
6. n8n relee el lead actual.
7. n8n actualiza la etapa Odoo y crea una actividad idempotente.

Para ZCal, la landing envía el UUID como parámetro `a4`. Para Calendly/Cal.com se debe configurar
metadata equivalente. No correlacionar agendamientos solamente por email.

## 3. Supabase

### 3.1 Scripts del proyecto

Ejecutar desde el SQL Editor en este orden:

```text
supabase/scripts/01_create_leads.sql
supabase/scripts/02_create_n8n_webhook.sql
```

El primer script crea la tabla completa, índices, RLS y `updated_at`. El segundo crea el webhook a
n8n y debe ejecutarse únicamente cuando n8n ya tenga una URL de producción.

### 3.2 Tabla `public.leads`

#### Identidad e idempotencia

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `bigint identity` | PK interna de Supabase |
| `submission_id` | `uuid` | UNIQUE, NOT NULL, UUID de idempotencia |

#### Contacto

| Campo | Tipo | Regla |
|---|---|---|
| `name` | `text` | 2-120 caracteres, sin espacios externos |
| `email` | `text` | 3-254 caracteres y formato email |
| `country_code` | `text` | Formato `+NNN`, máximo tres dígitos |
| `phone` | `text` | 7-32 caracteres |
| `phone_normalized` | `text` | E.164: `^\+[1-9][0-9]{7,14}$` |

#### Datos comerciales

| Campo | Tipo | Regla |
|---|---|---|
| `activity` | `text` | 1-160 caracteres |
| `advice` | `text` | 1-160 caracteres |
| `question` | `text` | Nullable, máximo 2.000 caracteres |
| `status` | `text` | `new`, `contacted`, `qualified`, `scheduled`, `won`, `lost`, `spam` |

#### Origen y atribución

| Campo | Tipo | Uso |
|---|---|---|
| `platform` | `text` | `landing`, `webflow`, `facebook_ads`, `google_ads`, etc. |
| `source_detail` | `text` | Landing o formulario específico |
| `utm_source` | `text` | Plataforma de origen |
| `utm_medium` | `text` | Tipo de tráfico |
| `utm_campaign` | `text` | Campaña |
| `utm_content` | `text` | Variante de anuncio |
| `utm_term` | `text` | Keyword |
| `gclid` | `text` | Identificador Google Ads |
| `fbclid` | `text` | Identificador Meta |

#### Calendario

| Campo | Tipo | Uso |
|---|---|---|
| `registered_at` | `timestamptz` | Momento de envío del formulario |
| `scheduled_at` | `timestamptz` | Momento de la cita |
| `calendar_event_id` | `text` | ID externo de Calendly, Cal.com o ZCal |

#### Sincronización

| Campo | Tipo | Uso |
|---|---|---|
| `odoo_lead_id` | `bigint` | ID de `crm.lead` en Odoo |
| `odoo_sync_status` | `text` | `pending`, `synced`, `failed`, `skipped` |
| `odoo_sync_error` | `text` | Error sanitizado, máximo 4.000 caracteres |
| `odoo_synced_at` | `timestamptz` | Última sincronización exitosa |
| `source_version` | `bigint` | Versión actual de datos de negocio |
| `odoo_synced_version` | `bigint` | Versión que Odoo confirmó |

#### Auditoría

| Campo | Tipo | Uso |
|---|---|---|
| `created_at` | `timestamptz` | Creación, default `now()` |
| `updated_at` | `timestamptz` | Último cambio, gestionado por trigger |

### 3.3 Versionado de sincronización

Los campos de negocio son:

```text
name, email, country_code, phone, phone_normalized,
activity, advice, question, status, platform, source_detail,
```

Cuando alguno cambia:

```text
source_version = source_version + 1
odoo_sync_status = 'pending'
odoo_sync_error = null
```

Cuando n8n solo actualiza metadatos de Odoo no se incrementa `source_version`. Esto evita que el
feedback de sincronización genere un loop infinito.

El PATCH de éxito en n8n debe filtrar también por la versión leída:

```text
PATCH /rest/v1/leads?submission_id=eq.UUID&source_version=eq.VERSION
```

Si no devuelve filas, el lead cambió durante el procesamiento. No marcar como sincronizada una
versión que ya no es la actual.

### 3.4 Seguridad de Supabase

- RLS está habilitado en `public.leads`.
- `anon` y `authenticated` no tienen `SELECT`, `UPDATE` ni `DELETE`.
- Las escrituras server-side usan `SUPABASE_SERVICE_ROLE_KEY` únicamente en Cloudflare/n8n.
- Nunca poner `service_role` en JavaScript del navegador.
- La landing debe usar Turnstile y rate limiting.
- El trigger usa `net.http_post`, no `supabase_functions.http_request`, porque este proyecto no tiene
  el esquema `supabase_functions` disponible.
- `pg_net` es asíncrono y no es una cola durable. El workflow de reconciliación debe buscar leads no
  confirmados (`odoo_synced_version is distinct from source_version`).

## 4. Personalización de Odoo CRM

## 4.1 Campos estándar reutilizados

No crear campos personalizados si Odoo ya tiene el campo estándar.

| Supabase | Odoo | Tipo Odoo |
|---|---|---|
| `name` + `activity` | `name` | Char |
| `name` | `contact_name` | Char |
| `email` | `email_from` | Char |
| `phone_normalized` | `phone` | Char |
| `advice` + `question` | `description` | HTML/Text |
| `status` | `stage_id` | Many2one a `crm.stage` |
| `utm_source` | `source_id` | Many2one a `utm.source` |
| `utm_medium` | `medium_id` | Many2one a `utm.medium` |
| `utm_campaign` | `campaign_id` | Many2one a `utm.campaign` |
| Tipo | `type` | Selection, valor `lead` |

## 4.2 Campos personalizados mínimos

Ir a **Odoo Studio → CRM → Leads/Oportunidades → Add Field**.

| Etiqueta visible | Nombre técnico | Tipo | Configuración |
|---|---|---|---|
| Submission ID | `x_submission_id` | Text/Char | Indexado y único |
| Calendar Event ID | `x_calendar_event_id` | Text/Char | Indexado y único cuando no sea vacío |
| Scheduled At | `x_scheduled_at` | Date & Time | Visible en formulario y lista |
| Source Detail | `x_source_detail` | Text/Char | Indexado si se filtra frecuentemente |
| UTM Content | `x_utm_content` | Text/Char | Para reportes de variante |
| UTM Term | `x_utm_term` | Text/Char | Para keywords |
| GCLID | `x_gclid` | Text/Char | No mostrar a todos los usuarios |
| FBCLID | `x_fbclid` | Text/Char | No mostrar a todos los usuarios |

### Reglas importantes en Studio

1. `x_submission_id` debe ser obligatorio para leads creados por la integración.
2. Activar indexación para `x_submission_id`.
3. Activar unicidad si la edición de Odoo lo permite.
4. `x_calendar_event_id` también debe ser indexado.
5. No hacer único el email: una persona puede crear oportunidades distintas.
6. No convertir `status` de Supabase en un campo de texto duplicado; el estado operativo de Odoo es
   `stage_id`.
7. El mapa de etapas debe ser explícito por equipo comercial.

### 4.3 Unicidad real mediante módulo Python

Odoo Studio puede crear el campo, pero dependiendo de la versión no siempre garantiza una restricción
SQL única. Para producción, un módulo pequeño es más fiable.

Estructura:

```text
lead_integration/
├── __init__.py
├── __manifest__.py
└── models/
    ├── __init__.py
    └── crm_lead.py
```

`__manifest__.py`:

```python
{
    "name": "Lead Integration Fields",
    "version": "1.0.0",
    "depends": ["crm", "utm", "mail"],
    "data": ["views/crm_lead_views.xml"],
    "installable": True,
}
```

`__init__.py`:

```python
from . import models
```

`models/__init__.py`:

```python
from . import crm_lead
```

`models/crm_lead.py`:

```python
from odoo import fields, models


class CrmLead(models.Model):
    _inherit = "crm.lead"

    x_submission_id = fields.Char(
        string="Submission ID",
        index=True,
        copy=False,
    )
    x_calendar_event_id = fields.Char(
        string="Calendar Event ID",
        index=True,
        copy=False,
    )
    x_scheduled_at = fields.Datetime(
        string="Scheduled At",
        copy=False,
    )
    x_source_detail = fields.Char(string="Source Detail")
    x_utm_content = fields.Char(string="UTM Content")
    x_utm_term = fields.Char(string="UTM Term")
    x_gclid = fields.Char(string="GCLID", copy=False)
    x_fbclid = fields.Char(string="FBCLID", copy=False)

    _sql_constraints = [
        (
            "crm_lead_submission_id_unique",
            "unique(x_submission_id)",
            "Submission ID must be unique.",
        ),
    ]
```

> [!warning] `NULL` y cadenas vacías
> PostgreSQL permite múltiples `NULL` en una restricción única. n8n debe enviar `false` o no enviar el
> campo cuando el valor no exista, nunca crear una cadena vacía como identificador.

Vista opcional `views/crm_lead_views.xml`:

```xml
<odoo>
    <record id="crm_lead_view_form_integration_fields" model="ir.ui.view">
        <field name="name">crm.lead.form.integration.fields</field>
        <field name="model">crm.lead</field>
        <field name="inherit_id" ref="crm.crm_lead_view_form"/>
        <field name="arch" type="xml">
            <xpath expr="//field[@name='description']" position="before">
                <field name="x_submission_id" readonly="1"/>
                <field name="x_calendar_event_id" readonly="1"/>
                <field name="x_scheduled_at" readonly="1"/>
                <field name="x_source_detail"/>
            </xpath>
        </field>
    </record>
</odoo>
```

### 4.4 Unicidad de actividades de calendario

Para que un retry no cree dos `mail.activity`, guardar el identificador externo en un campo único de
la actividad o en una tabla/módulo de correlación. La búsqueda previa no es suficiente bajo
concurrencia.

Opciones, en orden recomendado:

1. Crear un módulo que agregue `x_calendar_event_id` a `mail.activity` y una restricción única.
2. Crear un modelo `lead.calendar.event` con `calendar_event_id` único, `lead_id`, `activity_id` y
   estado del evento.
3. Solo como solución temporal, buscar por resumen y lead antes de crear.

La opción 3 no debe usarse como garantía de idempotencia en producción.

## 5. Estandarización de UTMs

El separador oficial es `_`.

### `utm_source`

```text
google
facebook
instagram
linkedin
tiktok
newsletter
facebook_organic
linkedin_organic
```

### `utm_medium`

```text
cpc
paid_social
email
organic
referral
cpm
```

### `utm_campaign`

Formato:

```text
[producto]_[mes]_[año]_[variante]
```

Ejemplo:

```text
curso_python_may_2026_launch
```

Regex:

```regex
^[a-z0-9]+(_[a-z0-9]+)+$
```

Antes de crear un registro UTM en Odoo, validar:

```regex
^[a-z0-9_-]+$
```

Si un UTM falla:

1. Registrar una advertencia con `submission_id` y nombre del campo.
2. No enviar ese Many2one a Odoo, o enviar `false` si se está limpiando un valor anterior.
3. No fallar todo el lead.
4. Conservar el valor original en Supabase.

## 6. Workflow de n8n

### 6.1 Workflows necesarios

```text
WF-01 Lead Webhook Receiver
WF-02 Process Current Lead
WF-03 Resolve Odoo UTM
WF-04 Lead Reconciliation
WF-05 Global Error Handler
```

### 6.2 `WF-01 Lead Webhook Receiver`

1. **Webhook**
   - Método: `POST`
   - URL producción: `/webhook/<workflow-id>`
   - Header Auth: `X-Webhook-Secret`
   - Respuesta: inmediata, `On Received`
2. **Code: Validate Envelope**
   - Aceptar solo `schema=public`, `table=leads`.
   - Aceptar `INSERT` y `UPDATE`.
   - Validar `record.submission_id`.
3. **Execute Sub-workflow: Process Current Lead**
   - Enviar el envelope y el motivo.
4. Responder `200` tras aceptar el evento.

El `200` significa “n8n recibió la notificación”, no “Odoo ya fue sincronizado”.

### 6.3 `WF-02 Process Current Lead`

1. Recibir `{submission_id, type, record, old_record, reason}`.
2. Leer la fila actual en Supabase por `submission_id`.
3. Usar siempre la fila recién leída, no el snapshot del webhook.
4. Comprobar `odoo_lead_id` y `odoo_sync_status`.
5. Buscar `crm.lead` por `x_submission_id`.
6. Resolver `utm.source`, `utm.medium` y `utm.campaign`.
7. Crear o actualizar `crm.lead`.
8. Si hubo transición `scheduled_at: null → valor`, actualizar etapa y crear actividad.
9. Hacer PATCH condicional en Supabase por `submission_id` y `source_version`.
10. Si el PATCH no devuelve filas, dejar pendiente y procesar la versión siguiente.

Configurar concurrencia global `1` al inicio. Si más adelante se necesita paralelismo, usar una cola
particionada o lock por `submission_id`.

### 6.4 Creación Odoo

Payload conceptual:

```json
{
  "name": "Nombre - Actividad",
  "contact_name": "Nombre",
  "email_from": "email@example.com",
  "phone": "+593991234567",
  "description": "Asesoría: ...\n\nPregunta: ...",
  "campaign_id": 12,
  "source_id": 4,
  "medium_id": 7,
  "type": "lead",
  "x_submission_id": "uuid"
}
```

Valores Many2one vacíos deben ser `false`, no `""`.

### 6.5 Resolución de UTMs

Para cada campo:

1. Validar allowlist/regex.
2. Buscar por nombre exacto.
3. Si existe, devolver `id`.
4. Si no existe, crear `{name: valor}`.
5. Manejar conflicto de unicidad releyendo el registro existente.

Modelos permitidos:

```text
utm.source
utm.medium
utm.campaign
```

Nunca aceptar un nombre de modelo arbitrario desde el webhook.

### 6.6 Actualizaciones

No usar rutas mutuamente excluyentes para cambios de estado, contacto y cita. Un único UPDATE puede
contener varios cambios y debe generar un solo `write` combinado en Odoo.

| Cambio Supabase | Acción Odoo |
|---|---|
| `scheduled_at: null → fecha` | Etapa `scheduled` + actividad idempotente |
| `status` cambia | Mapear a `stage_id` |
| Contacto cambia | Actualizar `contact_name`, `email_from`, `phone` |
| UTM cambia | Resolver y actualizar Many2one |
| UTM pasa a inválido/null | Enviar `false` para limpiar valor anterior |
| Solo cambian campos `odoo_*`, `odoo_synced_*`, `updated_at` | Terminar sin llamar Odoo |

Estados terminales recomendados: si el lead está `won`, `lost` o `spam`, una cita nueva se registra,
pero no debe sobrescribir automáticamente la etapa terminal sin una regla comercial explícita.

### 6.7 Errores y reintentos

Reintentar únicamente:

```text
timeout
408
429
500-599
```

No reintentar automáticamente errores permanentes de validación o permisos (`400`, `401`, `403`,
`404` de configuración). Marcar como `skipped` y alertar.

Para fallos transitorios agotados:

```text
odoo_sync_status = failed
odoo_sync_error = mensaje sanitizado
```

El error global usa:

```text
Error Trigger → Redact Error → Slack/Email
```

No incluir email, teléfono ni el body completo en Slack.

## 7. Reconciliación

El webhook de Supabase es asíncrono. Crear un workflow programado cada cinco minutos:

1. Consultar leads donde:

```text
odoo_synced_version IS NULL
OR odoo_synced_version <> source_version
```

2. Excluir `odoo_sync_status = skipped`.
3. Procesar en lotes pequeños.
4. Usar el mismo `WF-02 Process Current Lead`.
5. Alertar por antigüedad del lead más antiguo pendiente.

Para reintentos automáticos de `failed`, agregar posteriormente:

```text
odoo_sync_attempts
odoo_last_attempt_at
odoo_next_retry_at
```

y un límite máximo de intentos. No reintentar `failed` indefinidamente sin backoff.

## 8. Variables y secretos

### Cloudflare

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY       # Secret
TURNSTILE_SECRET_KEY            # Secret
CALENDAR_WEBHOOK_SECRET         # Secret
PUBLIC_TURNSTILE_SITE_KEY       # Build variable
```

### n8n

```text
SUPABASE_SERVICE_ROLE_KEY       # Credential server-side
ODOO_URL                        # Credential/configuración
ODOO_DATABASE                   # Credential/configuración
ODOO_USERNAME                   # Credential
ODOO_PASSWORD/API_KEY           # Credential
X-Webhook-Secret                # Header Auth
```

Rotar secretos ante cualquier exposición. No poner secretos en nodos `Code`, URLs visibles,
repositorio ni documentación compartida.

## 9. Pruebas de aceptación

### Supabase

- [ ] `public.leads` existe.
- [ ] RLS está habilitado.
- [ ] `anon` no puede leer ni modificar leads.
- [ ] `submission_id` es único.
- [ ] `updated_at` cambia automáticamente.
- [ ] Un UTM inválido no rompe el INSERT.

### Odoo

- [ ] Existe `x_submission_id`.
- [ ] `x_submission_id` es único e indexado.
- [ ] Existe el mapa de etapas.
- [ ] Existen permisos para CRM, UTMs y actividades.
- [ ] El identificador de calendario es idempotente.

### n8n

- [ ] El webhook de prueba recibe INSERT.
- [ ] El webhook de producción recibe INSERT.
- [ ] Un retry no duplica `crm.lead`.
- [ ] UPDATE de contacto actualiza Odoo.
- [ ] UPDATE de status cambia `stage_id`.
- [ ] Agendamiento crea una única actividad.
- [ ] El PATCH de feedback no genera loop.
- [ ] Un evento perdido se recupera por reconciliación.
- [ ] Un error permanente no se reintenta indefinidamente.

### Cloudflare

- [ ] Falta de Turnstile devuelve error.
- [ ] Rate limiting está activo.
- [ ] Confirmación de calendario sin secreto devuelve `401`.
- [ ] UUID inexistente devuelve `404`.
- [ ] Body superior a 1 KiB devuelve `413`.
- [ ] Retry de calendario no crea inconsistencias.

## 10. Despliegue recomendado

1. Crear campos y restricciones únicas en Odoo.
2. Crear las credenciales de Odoo, Supabase y n8n.
3. Crear los cinco workflows de n8n inactivos.
4. Probar el webhook con `/webhook-test/`.
5. Configurar Turnstile y rate limiting en Cloudflare.
6. Activar processor, webhook de producción, reconciliación y error global.
7. Copiar la URL `/webhook/<workflow-id>` de producción.
8. Reemplazar `REPLACE_WITH_WORKFLOW_ID` y `REPLACE_WITH_N8N_WEBHOOK_SECRET` en
   `supabase/scripts/02_create_n8n_webhook.sql`.
9. Ejecutar `supabase/scripts/01_create_leads.sql` si aún no fue ejecutado.
10. Ejecutar `supabase/scripts/02_create_n8n_webhook.sql`.
11. Configurar variables de Cloudflare y desplegar Pages.
12. Configurar el proveedor de calendario con la URL de Cloudflare.
13. Ejecutar las pruebas de aceptación.
14. Revisar `net._http_response`, ejecuciones fallidas de n8n y retención de PII.

## 11. Consultas útiles

### Leads pendientes

```sql
select submission_id, source_version, odoo_synced_version,
       odoo_sync_status, created_at, updated_at
from public.leads
where odoo_synced_version is distinct from source_version
order by created_at asc;
```

### Errores de pg_net

```sql
select id, status_code, error_msg, created
from net._http_response
where status_code >= 400 or error_msg is not null
order by created desc;
```

### Verificar RLS

```sql
select relname, relrowsecurity
from pg_class
where oid = 'public.leads'::regclass;
```

## 12. Archivos del proyecto

```text
supabase/scripts/01_create_leads.sql
supabase/scripts/02_create_n8n_webhook.sql
supabase/migrations/202609090001_configure_leads.sql
supabase/migrations/20260914220406_create_leads_pipeline.sql
functions/api/leads.ts
functions/api/calendar-confirmation.ts
src/components/landing.astro
docs/leads/integration.md
```

## 13. Referencias

- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Odoo CRM Documentation](https://www.odoo.com/documentation/)
