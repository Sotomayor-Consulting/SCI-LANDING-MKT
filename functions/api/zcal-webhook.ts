// POST /api/zcal-webhook — receptor de los webhooks de Zcal
// (event.created / event.rescheduled / event.cancelled).
//
// Verifica la firma HMAC-SHA256 (header `x-zcal-webhook-signature`, hex) y, POR
// AHORA, SOLO GENERA LOGS. La creación de la agenda en Supabase (tabla
// `meetings`) la implementa OTRO EQUIPO; aquí queda el seam abierto. La
// correlación con el lead es por **email del invitado**.

interface Env {
  ZCAL_WEBHOOK_SECRET?: string;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

const MAX_BODY_SIZE = 65_536;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** HMAC-SHA256(body, secret) en hex (formato de la firma de Zcal). */
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type ZcalAnswer = { question?: string; answer?: string | string[] };
type ZcalAttendee = {
  name?: string;
  email?: string;
  phoneNumber?: string;
  type?: string;
  customQuestionAnswers?: ZcalAnswer[];
};

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_SIZE) return json({ ok: false, error: "payload_too_large" }, 413);

  // Verificación de firma (sobre el body crudo). Si no hay secret, se avisa.
  if (env.ZCAL_WEBHOOK_SECRET) {
    const received = (request.headers.get("x-zcal-webhook-signature") || "").trim().toLowerCase();
    const expected = await hmacSha256Hex(env.ZCAL_WEBHOOK_SECRET, raw);
    if (!received || !timingSafeEqual(received, expected)) {
      console.warn("zcal-webhook: firma inválida o ausente");
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  } else {
    console.warn("zcal-webhook: ZCAL_WEBHOOK_SECRET no configurado — sin verificación de firma");
  }

  let payload: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const type = payload.type ?? "unknown";
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const attendees = Array.isArray(data.attendees) ? (data.attendees as ZcalAttendee[]) : [];
  const invitee = attendees.find((a) => a.type === "invitee") ?? attendees[0];

  // Correlación por email del invitado (decisión del funnel actual).
  console.info("zcal-webhook", {
    type, // event.created | event.rescheduled | event.cancelled
    eventId: data.id,
    startDate: data.startDate,
    eventName: data.eventName,
    email: invitee?.email,
    phone: invitee?.phoneNumber,
    name: invitee?.name,
    answers: (invitee?.customQuestionAnswers ?? []).map((a) => ({ q: a.question, a: a.answer })),
  });

  // TODO(otro equipo): crear/actualizar la agenda en Supabase (public.meetings),
  //   correlacionando por email del invitado, según el tipo de evento:
  //   event.created → insert; event.rescheduled → update; event.cancelled → marcar cancelada.
  // TODO(seam): despachar el CAPI `Schedule` (reusar functions/api/_conversions.ts)
  //   en event.created, con email/phone del invitado (el servicio los hashea).

  return json({ ok: true, received: type });
}
