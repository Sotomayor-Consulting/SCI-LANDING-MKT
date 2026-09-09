# Cloudflare Pages Deployment

This project deploys as a static Astro site with a Pages Function at `POST /api/leads`.

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

Configure both Production and Preview if preview deployments must submit test leads. Never commit
the service-role key to Git or place it in a `PUBLIC_*` variable.

Redeploy the latest commit after adding or changing runtime variables.

## Test Production

1. Open the generated `*.pages.dev` URL.
2. Complete both form steps with a test lead.
3. Confirm that the calendar appears only after the request succeeds.
4. Confirm the row in Supabase **Table Editor**, table `leads`.
5. In Cloudflare, open the deployment and select **View details**, then **Functions**, to inspect
   errors from `/api/leads`.

## Local Pages Test

Create an ignored `.dev.vars` file using `.dev.vars.example` as the template, then run:

```sh
pnpm run pages:dev
```

The complete Pages site, including `/api/leads`, is served at `http://localhost:8788` by default.

## Custom Domain

After the `*.pages.dev` test passes, open **Custom domains**, select **Set up a domain**, and follow
the DNS prompts. Test the form again on the final domain.
