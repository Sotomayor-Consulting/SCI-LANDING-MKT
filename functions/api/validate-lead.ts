// POST /api/validate-lead — valida el lead antes de mostrar el calendario.
//
// SEAM: la validación real la implementa el equipo de datos con un cliente Odoo
// (axios + JSON-RPC) que devuelve estados BLACKLISTED / EXISTED. La comprobación
// "tiene agenda" (hasAgenda) se resuelve contra la tabla Supabase `meetings`
// (esquema aún pendiente). Mientras tanto, veredicto de prueba por email.
//
// Contrato de salida:
//   { ok, status: "OK" | "BLACKLISTED" | "EXISTED", hasAgenda: boolean, submissionId }
//   ok = puede continuar a la agenda = status !== "BLACKLISTED" && !hasAgenda

interface Env {
  // Reservado para el cliente Odoo (validación) y la consulta a `meetings`.
  ODOO_URL?: string;
  ODOO_DB?: string;
  ODOO_API_KEY?: string;
  DATABASE_URL?: string;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

type LeadStatus = "OK" | "BLACKLISTED" | "EXISTED";

const MAX_BODY_SIZE = 4_096;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function str(value: Record<string, unknown>, key: string): string {
  const v = value[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * STUB de validación Odoo. Reemplazar por el cliente axios/JSON-RPC del equipo de
 * datos, que devolverá BLACKLISTED / EXISTED / OK a partir de email + teléfono.
 */
function mockOdooStatus(email: string): LeadStatus {
  const e = email.toLowerCase();
  if (e.includes("blacklist") || e.includes("spam")) return "BLACKLISTED";
  if (e.includes("existe") || e.includes("existed") || e.includes("agendado") || e.includes("scheduled")) {
    return "EXISTED";
  }
  return "OK";
}

/**
 * SEAM "tiene agenda": debe consultar la tabla Supabase `meetings` por
 * submission_id/email (con `pg`, ver functions/_infrastructure/db). El esquema de
 * `meetings` lo define otro equipo; hasta entonces se deriva del email de prueba.
 */
async function hasMeeting(email: string, _env: Env): Promise<boolean> {
  // TODO(meetings): SELECT 1 FROM public.meetings WHERE email = $1 (o submission_id) LIMIT 1.
  return email.toLowerCase().includes("agendado") || email.toLowerCase().includes("scheduled");
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
    return json({ ok: false, status: "BLACKLISTED" as LeadStatus, hasAgenda: false, submissionId: "" });
  }

  const name = str(body, "name");
  const email = str(body, "email").toLowerCase();
  const phone = str(body, "phone");

  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 120) errors.name = "invalid";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) errors.email = "invalid";
  if (phone.replace(/\D/g, "").length < 7) errors.phone = "invalid";
  if (Object.keys(errors).length > 0) {
    return json({ ok: false, error: "validation_failed", fields: errors }, 422);
  }

  // TODO(equipo datos): sustituir mockOdooStatus por el cliente Odoo (axios/JSON-RPC).
  const status = mockOdooStatus(email);
  const hasAgenda = status === "BLACKLISTED" ? false : await hasMeeting(email, env);
  const submissionId = crypto.randomUUID();
  const ok = status !== "BLACKLISTED" && !hasAgenda;

  return json({ ok, status, hasAgenda, submissionId });
}
