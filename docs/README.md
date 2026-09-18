# Documentación — SCI Landing MKT

Índice de la documentación del proyecto. Los archivos de raíz (`README.md`, `CLAUDE.md`,
`AGENTS.md`) se mantienen fuera de `docs/` porque los cargan las herramientas y agentes.

## Estructura

```
docs/
├── README.md                 # este índice
├── deployment/
│   └── cloudflare.md         # despliegue en Cloudflare Pages + Functions + variables
└── leads/
    ├── integration.md        # arquitectura de leads: Supabase, n8n y Odoo
    └── stack.md              # stack de captación (visión general y archivos)
```

## Despliegue

- [**Cloudflare Pages**](./deployment/cloudflare.md) — build estático, Pages Functions
  (`functions/api/*`), variables de entorno y pruebas locales con `wrangler`.

## Leads y backend

- [**Integración de leads**](./leads/integration.md) — Supabase como sistema de registro, n8n
  como sincronizador hacia Odoo, idempotencia y reconciliación.
- [**Stack de captación**](./leads/stack.md) — visión general del stack y mapa de archivos.

## Arquitectura del backend (resumen)

Sitio **estático** (Astro, `output: 'static'`) desplegado en **Cloudflare Pages**. El backend son
**Pages Functions** en `functions/`, que leen secretos desde `context.env`:

| Endpoint | Rol |
| --- | --- |
| `POST /api/leads` | Guarda el lead en Supabase (protegido con Turnstile). |
| `POST /api/validate-lead` | Valida el lead antes de mostrar el calendario. |
| `POST /api/create-lead` | Persiste el lead en Supabase (idempotente por `submission_id`); n8n lo sincroniza a Odoo. |
| `POST /api/tiktok-capi` | Conversiones server-side (CAPI) a TikTok/Meta. |
| `POST /api/calendar-confirmation` | Webhook (firmado) que registra la cita agendada. |
| `POST /api/zcal-webhook` | Recibe los webhooks de Zcal (reserva/reprogramación/cancelación); hoy solo loguea. |

Infraestructura compartida entre landings/equipos en `functions/_infrastructure/`
(instancia axios común en `http.ts`, cliente Odoo JSON-RPC en `odoo/`). Los archivos/carpetas con
prefijo `_` no se enrutan; son helpers importables.

> Nota: no se usan **Astro Actions** — requieren renderizado on-demand (servidor), y en un deploy
> estático de Pages el backend son Pages Functions. Ver
> [deployment/cloudflare.md](./deployment/cloudflare.md).
