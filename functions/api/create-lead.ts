import { insertLead, type LeadRecord } from "../_infrastructure/db/leads";
import type { DbEnv } from "../_infrastructure/db/client";

// POST /api/create-lead — persiste el lead en Supabase (Postgres directo con el
// connection string del pooler, vía `pg`) cuando el cliente termina el registro.
// Supabase es la fuente de verdad; n8n sincroniza después hacia Odoo. Idempotente
// por submission_id. Sin DATABASE_URL responde skipped (no rompe el flujo).

interface FunctionContext {
  request: Request;
  env: DbEnv;
}

const MAX_BODY_SIZE = 8_192;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE_PATTERN = /^\+[1-9]\d{0,2}$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function str(value: Record<string, unknown>, key: string, max = 2000): string {
  const v = value[key];
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "unsupported_media_type" }, 415);
  }
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_SIZE) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_SIZE) return json({ ok: false, error: "payload_too_large" }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // Honeypot: si viene relleno, cortamos en silencio (probable bot).
  if (str(body, "website")) {
    return json({ ok: true, created: false, skipped: true });
  }

  const name = str(body, "name", 120);
  const email = str(body, "email", 254).toLowerCase();
  const countryCode = str(body, "countryCode", 5) || str(body, "country", 5);
  const phoneRaw = str(body, "phone", 32);
  const facturacion = str(body, "facturacion", 120);
  const tema = str(body, "tema", 2000);
  const submissionId = str(body, "submissionId", 36) || str(body, "submission_id", 36);

  const localDigits = phoneRaw.replace(/\D/g, "").replace(/^0+/, "");
  const phoneNormalized = `${countryCode}${localDigits}`;

  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 120) errors.name = "invalid";
  if (!EMAIL_PATTERN.test(email)) errors.email = "invalid";
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) errors.countryCode = "invalid";
  if (localDigits.length < 7 || !E164_PATTERN.test(phoneNormalized)) errors.phone = "invalid";
  if (!UUID_PATTERN.test(submissionId)) errors.submissionId = "invalid";
  if (Object.keys(errors).length > 0) {
    return json({ ok: false, error: "validation_failed", fields: errors }, 422);
  }

  // Mapeo a `leads` (activity/advice son NOT NULL → valores fijos; la facturación
  // va a source_detail hasta tener columna propia).
  const record: LeadRecord = {
    submissionId,
    name,
    email,
    countryCode,
    phone: phoneRaw || localDigits,
    phoneNormalized,
    activity: "Asesoría LLC",
    advice: "Agenda asesoría por Zoom",
    question: tema || null,
    platform: "thank_you_crea_llc",
    sourceDetail: facturacion ? `Facturación: ${facturacion}` : null,
  };

  try {
    const result = await insertLead(record, env);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("create-lead db error", {
      submissionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: "lead_storage_failed" }, 502);
  }
}
