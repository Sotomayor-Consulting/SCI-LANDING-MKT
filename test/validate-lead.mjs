// Runner de humo para /api/validate-lead usando test/fixtures.json.
// Requiere el sitio + Functions corriendo (pnpm run pages:dev → http://localhost:8788).
//
// Uso:
//   node test/validate-lead.mjs
//   BASE_URL=https://<tu-deploy>.pages.dev node test/validate-lead.mjs
//
// Sale con código 1 si algún caso no coincide con lo esperado.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL || "http://localhost:8788").replace(/\/+$/, "");
const here = dirname(fileURLToPath(import.meta.url));
const { leads } = JSON.parse(await readFile(join(here, "fixtures.json"), "utf8"));

console.log(`→ POST ${BASE}/api/validate-lead  (${leads.length} casos)\n`);

let failed = 0;
for (const lead of leads) {
  try {
    const res = await fetch(`${BASE}/api/validate-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead.payload),
    });
    const data = await res.json().catch(() => ({}));

    const pass =
      res.status === 200 &&
      data.status === lead.expect.status &&
      Boolean(data.hasAgenda) === lead.expect.hasAgenda &&
      Boolean(data.ok) === lead.expect.ok;

    if (!pass) failed += 1;
    console.log(
      `${pass ? "✅ PASS" : "❌ FAIL"}  ${lead.label.padEnd(22)} ` +
        `status=${data.status} hasAgenda=${data.hasAgenda} ok=${data.ok}`,
    );
    console.log(`         ${lead.description}`);
    if (!pass) {
      console.log(`         esperado ${JSON.stringify(lead.expect)} · recibido [${res.status}] ${JSON.stringify(data)}`);
    }
  } catch (error) {
    failed += 1;
    console.log(`❌ FAIL  ${lead.label}  → ${error.message}`);
    console.log(`         ¿Está corriendo "pnpm run pages:dev" en ${BASE}?`);
  }
}

console.log(`\n${leads.length - failed}/${leads.length} OK`);
process.exit(failed ? 1 : 0);
