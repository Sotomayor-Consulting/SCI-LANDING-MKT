---
description: Levanta el sitio con Cloudflare Pages Functions (wrangler) para probar /api/*
allowed-tools: Bash
---

Levanta el sitio estático + las Pages Functions con wrangler:

```sh
pnpm run pages:dev
```

Queda en `http://localhost:8788`. Recuerda: **`astro dev` (4321) NO ejecuta las Functions** — usa este comando cuando necesites probar `/api/leads`, `/api/validate-lead`, `/api/create-lead`, `/api/tiktok-capi` o `/api/calendar-confirmation`.

Tras arrancar, haz un smoke test, por ejemplo:

```sh
curl -s http://localhost:8788/api/validate-lead -H "Content-Type: application/json" \
  --data '{"name":"Test User","email":"test@example.com","phone":"+593999999999","facturacion":"Menos de 10.000"}'
```
