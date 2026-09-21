# test/

Valores de prueba y runner de humo para el flujo de leads.

## Qué hay

- **`fixtures.json`** — leads de prueba que activan cada veredicto de
  `/api/validate-lead`: lista negra, ya registrado con agenda, ya registrado sin
  agenda y lead nuevo válido.
- **`validate-lead.mjs`** — envía cada fixture al endpoint y compara el resultado
  con lo esperado (`status`, `hasAgenda`, `ok`).

## Cómo correrlo

Las Functions corren con wrangler (no con `astro dev`):

```sh
pnpm run pages:dev          # levanta el sitio + /api/* en http://localhost:8788
# en otra terminal:
pnpm run test:leads         # o: node test/validate-lead.mjs
```

Contra un deploy:

```sh
BASE_URL=https://tu-deploy.pages.dev node test/validate-lead.mjs
```

## Cómo se disparan los veredictos (stub actual)

Hoy la validación es un **stub por email** en `functions/api/validate-lead.ts`
(mientras el equipo de Odoo conecta la validación real con axios/JSON-RPC):

| Email contiene            | status       | hasAgenda | UI                              |
| ------------------------- | ------------ | --------- | ------------------------------- |
| `blacklist` / `spam`      | BLACKLISTED  | false     | "Inténtalo de nuevo más tarde"  |
| `agendado` / `scheduled`  | EXISTED      | true      | "Ya estás registrado…"          |
| `existe` / `existed`      | EXISTED      | false     | continúa al calendario          |
| (cualquier otro)          | OK           | false     | registrar + mostrar calendario  |

Cuando la validación real reemplace al stub, actualiza los emails de
`fixtures.json` (o su fuente de datos) manteniendo el contrato
`{ ok, status, hasAgenda, submissionId }`.
