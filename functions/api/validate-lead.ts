// POST /api/validate-lead — valida el lead antes de mostrar el calendario.
//
// STUB: la validación real (lista negra en Odoo vía axios/JSON-RPC + cita
// existente en Google Calendar / Zcal) la implementa el equipo de datos, que
// leerá sus credenciales desde context.env. Mientras tanto, veredicto de prueba
// según el email:
//   · contiene "blacklist" o "spam"     → blacklisted
//   · contiene "agendado" o "scheduled" → already_scheduled
//   · resto                              → ok

interface Env {
  // Reservado para credenciales de la validación real (Odoo / Google Calendar).
  ODOO_URL?: string;
  ODOO_DB?: string;
  ODOO_API_KEY?: string;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

type LeadVerdict = "ok" | "blacklisted" | "already_scheduled";

const MAX_BODY_SIZE = 4_096;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function str(value: Record<string, unknown>, key: string): string {
  const v = value[key];
  return typeof v === "string" ? v.trim() : "";
}

function mockValidate(email: string): LeadVerdict {
  const e = email.toLowerCase();
  if (e.includes("blacklist") || e.includes("spam")) return "blacklisted";
  if (e.includes("agendado") || e.includes("scheduled")) return "already_scheduled";
  return "ok";
}

export async function onRequestPost({ request, env: _env }: FunctionContext): Promise<Response> {
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
    return json({ ok: false, reason: "blacklisted" as LeadVerdict, submissionId: "" });
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

  // TODO(equipo datos): sustituir por Odoo (lista negra por email+phone) y
  // Google Calendar / Zcal (cita existente), usando _env para las credenciales.
  const reason = mockValidate(email);
  const submissionId = crypto.randomUUID();
  return json({ ok: reason === "ok", reason, submissionId });
}
