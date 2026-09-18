# Cloudflare Pages Deployment

This project deploys as a **static Astro site** (no adapter, `output: 'static'`) with Cloudflare
**Pages Functions** as the backend:

| Function | Purpose |
| --- | --- |
| `POST /api/leads` | Store a lead in Supabase (Turnstile-protected). |
| `POST /api/calendar-confirmation` | Webhook that records `scheduled_at` / `calendar_event_id`. |
| `POST /api/validate-lead` | Validate a lead before showing the calendar (blacklist / existing appointment). |
| `POST /api/create-lead` | Create the `crm.lead` in Odoo when the form is completed (idempotent). |
| `POST /api/tiktok-capi` | Server-side conversions (CAPI) to TikTok/Meta. |

Shared server-side infrastructure lives in `functions/_infrastructure/` (e.g. the shared axios
instance in `http.ts` and the Odoo JSON-RPC client in `odoo/`). Files/dirs prefixed with `_` are
importable helpers, not routes.

> Astro Actions are **not** used: they require on-demand rendering, and `@astrojs/cloudflare`
> only targets Cloudflare Workers. A static Pages deploy uses Pages Functions instead, which read
> secrets from `context.env`.

## Create The Pages Project

1. Push the current project to the `main` branch of `Sotomayor-Consulting/SCI-LANDING-MKT`.
2. Open Cloudflare Dashboard, then **Workers & Pages**.
3. Select **Create application**, **Pages**, and **Connect to Git**.
4. Authorize GitHub and select `Sotomayor-Consulting/SCI-LANDING-MKT`.
5. Use these deployment settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | `Astro` |
| Build command | `pnpm run build` |
| Build output directory | `dist` |
| Root directory | Leave empty |

6. Add the build environment variable `PNPM_VERSION` with value `12.3.4`.
7. Select **Save and Deploy**.

The root-level `functions` directory is detected automatically. Do not move it into `src` or
`dist`.

## Configure Runtime Variables

After the project exists, open **Settings**, then **Variables and Secrets** and add:

| Type | Name | Value |
| --- | --- | --- |
| Variable | `SUPABASE_URL` | `https://vzrrjkdhqqkxjedeukml.supabase.co` |
| Encrypted secret | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
| Encrypted secret | `CALENDAR_WEBHOOK_SECRET` | Shared secret for calendar confirmations |
| Encrypted secret | `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |
| Encrypted secret | `TIKTOK_ACCESS_TOKEN` | TikTok Events API token (CAPI) |
| Variable | `TIKTOK_PIXEL_ID` | TikTok pixel / `event_source_id` |
| Variable | `TIKTOK_TEST_EVENT_CODE` | Optional; surfaces events in TikTok → Test Events |

Meta Conversions API is supported by `/api/tiktok-capi` too; add these only when activating Meta:
`META_ACCESS_TOKEN` (secret), `META_PIXEL_ID`, `META_API_VERSION` (default `v21.0`),
`META_TEST_EVENT_CODE`. Each provider stays inactive until its credentials are present, so events
are simply skipped (no-op) when a platform is not configured.

Odoo lead creation (`/api/create-lead`) needs all four: `ODOO_URL` (variable),
`ODOO_DB` (variable), `ODOO_USERNAME` (variable) and `ODOO_API_KEY` (encrypted secret). When any is
missing the function responds `{ok:true, created:false, skipped:true}` and the booking flow
continues. The `crm.lead` model must have a unique technical field `x_submission_id` (see
`docs/leads/integration.md`) for idempotency.

Add `PUBLIC_TURNSTILE_SITE_KEY` as a build environment variable. For local development, put the site
key in an ignored `.env` file and the matching test secret in `.dev.vars` (see `.dev.vars.example`).

Configure both Production and Preview if preview deployments must submit test leads. Never commit
the service-role key to Git or place it in a `PUBLIC_*` variable.

Redeploy the latest commit after adding or changing runtime variables.

## Lead Validation and Conversions (CAPI)

The thank-you page (`/crea-tu-llc-en-usa/`) calls two same-origin functions with `fetch`:

- **`/api/validate-lead`** — validates the lead before revealing the calendar. It currently
  returns a **stub** verdict based on the email (`blacklist*`/`spam*` → blacklisted,
  `agendado*`/`scheduled*` → already scheduled, otherwise ok). The data team replaces
  `functions/api/validate-lead.ts` with the real checks (Odoo blacklist + Google Calendar / Zcal
  appointment), reading credentials from `context.env`.
- **`/api/tiktok-capi`** — multi-platform Conversions API. `functions/api/_conversions.ts` hashes
  PII (email/phone/external_id) with SHA-256, takes IP + User-Agent from the request, and posts to
  each enabled platform (TikTok today; Meta when configured). Adding a platform = a new sender in
  that helper. It never throws: results are returned per provider for logging.

## Test Production

1. Open the generated `*.pages.dev` URL.
2. Complete both form steps with a test lead.
3. Confirm that the calendar appears only after the request succeeds.
4. Confirm the row in Supabase **Table Editor**, table `leads`.
5. In Cloudflare, open the deployment and select **View details**, then **Functions**, to inspect
   errors from `/api/leads`.
6. Send a signed test request to `/api/calendar-confirmation` and confirm that the matching lead's
   `scheduled_at` and `calendar_event_id` fields change.

## Local Pages Test

Create an ignored `.dev.vars` file using `.dev.vars.example` as the template, then run:

```sh
pnpm run pages:dev
```

The complete Pages site, including `/api/leads`, `/api/validate-lead` and `/api/tiktok-capi`, is
served at `http://localhost:8788` by default. Example smoke test:

```sh
curl -s http://localhost:8788/api/validate-lead -H "Content-Type: application/json" \
  --data '{"name":"Test User","email":"test@example.com","phone":"+593999999999","facturacion":"Menos de 10.000"}'
# → {"ok":true,"reason":"ok","submissionId":"..."}
```

## Custom Domain

After the `*.pages.dev` test passes, open **Custom domains**, select **Set up a domain**, and follow
the DNS prompts. Test the form again on the final domain.
