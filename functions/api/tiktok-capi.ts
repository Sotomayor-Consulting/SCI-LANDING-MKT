import {
  dispatchConversion,
  type ConversionEvent,
  type ConversionsEnv,
  type StandardEvent,
} from "./_conversions";

// POST /api/tiktok-capi — reenvía un evento de conversión a las plataformas CAPI
// (TikTok/Meta) desde el servidor de Cloudflare Pages. IP y User-Agent se toman
// del request; la PII llega en crudo y se hashea dentro del helper.

interface FunctionContext {
  request: Request;
  env: ConversionsEnv;
}

const MAX_BODY_SIZE = 8_192;
const EVENTS: StandardEvent[] = ["ViewContent", "Contact", "CompleteRegistration", "Schedule"];

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function str(value: Record<string, unknown>, key: string, max = 512): string | undefined {
  const v = value[key];
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    undefined
  );
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

  const eventName = str(body, "event_name", 40) as StandardEvent | undefined;
  const eventId = str(body, "event_id", 200);
  if (!eventName || !EVENTS.includes(eventName)) {
    return json({ ok: false, error: "invalid_event_name" }, 422);
  }
  if (!eventId) {
    return json({ ok: false, error: "event_id_required" }, 422);
  }

  const event: ConversionEvent = {
    event: eventName,
    eventId,
    eventTime: Math.floor(Date.now() / 1000),
    pageUrl: str(body, "page_url", 2048),
    referrer: str(body, "referrer", 2048),
    user: {
      email: str(body, "email", 254),
      phone: str(body, "phone", 32),
      externalId: str(body, "external_id", 200) ?? str(body, "lead_id", 200),
      ttclid: str(body, "ttclid", 512),
      ttp: str(body, "ttp", 512),
      fbp: str(body, "fbp", 256),
      fbc: str(body, "fbc", 512),
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    },
    properties: {
      contentId: str(body, "content_id", 160),
      contentName: str(body, "content_name", 200),
      contentCategory: str(body, "content_category", 160),
    },
  };

  const results = await dispatchConversion(event, env);
  return json({ ok: true, event_id: eventId, results });
}
