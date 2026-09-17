// ============================================================================
// Conversiones (CAPI) para Cloudflare Pages Functions. fetch nativo + Web Crypto
// (runtime de Cloudflare). Multiplataforma: TikTok funcional; Meta como función
// interna lista para activar. El `env` llega desde context.env de la Function.
// ============================================================================

export type StandardEvent =
  | "ViewContent"
  | "Contact"
  | "CompleteRegistration"
  | "Schedule";

export interface ConversionUser {
  email?: string;
  phone?: string;
  externalId?: string;
  ttclid?: string;
  ttp?: string;
  fbp?: string;
  fbc?: string;
  ip?: string;
  userAgent?: string;
}

export interface ConversionEvent {
  event: StandardEvent;
  eventId: string;
  eventTime: number; // unix seconds
  pageUrl?: string;
  referrer?: string;
  user: ConversionUser;
  properties?: {
    contentId?: string;
    contentName?: string;
    contentCategory?: string;
    value?: number;
    currency?: string;
  };
}

export interface ProviderResult {
  provider: string;
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
}

export interface ConversionsEnv {
  TIKTOK_ACCESS_TOKEN?: string;
  TIKTOK_PIXEL_ID?: string;
  TIKTOK_TEST_EVENT_CODE?: string;
  META_ACCESS_TOKEN?: string;
  META_PIXEL_ID?: string;
  META_API_VERSION?: string;
  META_TEST_EVENT_CODE?: string;
}

const TIMEOUT_MS = 5000;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizePhoneE164 = (phone: string) => {
  const digits = phone.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
};

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ---- TikTok Events API 2.0 --------------------------------------------------

async function sendTikTok(event: ConversionEvent, env: ConversionsEnv): Promise<ProviderResult> {
  if (!env.TIKTOK_ACCESS_TOKEN || !env.TIKTOK_PIXEL_ID) {
    return { provider: "tiktok", ok: false, skipped: true };
  }

  const u = event.user;
  const user: Record<string, unknown> = {};
  if (u.email) user.email = await sha256Hex(normalizeEmail(u.email));
  if (u.phone) {
    const e164 = normalizePhoneE164(u.phone);
    if (e164) user.phone = await sha256Hex(e164);
  }
  if (u.externalId) user.external_id = await sha256Hex(u.externalId.trim().toLowerCase());
  if (u.ttclid) user.ttclid = u.ttclid; // no se hashea
  if (u.ttp) user.ttp = u.ttp;
  if (u.ip) user.ip = u.ip;
  if (u.userAgent) user.user_agent = u.userAgent;

  const p = event.properties ?? {};
  const properties: Record<string, unknown> = {};
  if (p.contentId) properties.content_id = p.contentId;
  if (p.contentName) properties.content_name = p.contentName;
  if (p.contentCategory) properties.content_category = p.contentCategory;
  if (typeof p.value === "number") properties.value = p.value;
  if (p.currency) properties.currency = p.currency;

  const body: Record<string, unknown> = {
    event_source: "web",
    event_source_id: env.TIKTOK_PIXEL_ID,
    data: [
      {
        event: event.event,
        event_time: event.eventTime,
        event_id: event.eventId,
        user,
        page: { url: event.pageUrl ?? "", referrer: event.referrer ?? "" },
        properties,
      },
    ],
  };
  if (env.TIKTOK_TEST_EVENT_CODE) body.test_event_code = env.TIKTOK_TEST_EVENT_CODE;

  try {
    const res = await postJson(
      "https://business-api.tiktok.com/open_api/v1.3/event/track/",
      body,
      { "Access-Token": env.TIKTOK_ACCESS_TOKEN },
    );
    let ok = res.ok;
    try {
      const data = (await res.json()) as { code?: number };
      ok = res.ok && data?.code === 0;
    } catch {
      /* respuesta sin JSON */
    }
    return { provider: "tiktok", ok, status: res.status };
  } catch (error) {
    return {
      provider: "tiktok",
      ok: false,
      error: error instanceof Error ? error.message : "request_failed",
    };
  }
}

// ---- Meta Conversions API (interna; se activa con META_ACCESS_TOKEN+PIXEL) --

const META_EVENT_MAP: Record<StandardEvent, string> = {
  ViewContent: "ViewContent",
  Contact: "Contact",
  CompleteRegistration: "Lead",
  Schedule: "Schedule",
};

async function sendMeta(event: ConversionEvent, env: ConversionsEnv): Promise<ProviderResult> {
  if (!env.META_ACCESS_TOKEN || !env.META_PIXEL_ID) {
    return { provider: "meta", ok: false, skipped: true };
  }

  const u = event.user;
  const userData: Record<string, unknown> = {};
  if (u.email) userData.em = [await sha256Hex(normalizeEmail(u.email))];
  if (u.phone) {
    const digits = normalizePhoneE164(u.phone).replace(/^\+/, "");
    if (digits) userData.ph = [await sha256Hex(digits)];
  }
  if (u.externalId) userData.external_id = [await sha256Hex(u.externalId.trim().toLowerCase())];
  if (u.fbp) userData.fbp = u.fbp;
  if (u.fbc) userData.fbc = u.fbc;
  if (u.ip) userData.client_ip_address = u.ip;
  if (u.userAgent) userData.client_user_agent = u.userAgent;

  const p = event.properties ?? {};
  const customData: Record<string, unknown> = {};
  if (p.contentName) customData.content_name = p.contentName;
  if (p.contentCategory) customData.content_category = p.contentCategory;
  if (p.contentId) customData.content_ids = [p.contentId];
  if (typeof p.value === "number") customData.value = p.value;
  if (p.currency) customData.currency = p.currency;

  const version = env.META_API_VERSION || "v21.0";
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: META_EVENT_MAP[event.event],
        event_time: event.eventTime,
        event_id: event.eventId,
        action_source: "website",
        event_source_url: event.pageUrl,
        user_data: userData,
        custom_data: customData,
      },
    ],
  };
  if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;

  const url = `https://graph.facebook.com/${version}/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_ACCESS_TOKEN)}`;
  try {
    const res = await postJson(url, body);
    return { provider: "meta", ok: res.ok, status: res.status };
  } catch (error) {
    return {
      provider: "meta",
      ok: false,
      error: error instanceof Error ? error.message : "request_failed",
    };
  }
}

/**
 * Reenvía el evento a todas las plataformas con credenciales configuradas.
 * Fire-and-forget: nunca lanza; devuelve el resultado por proveedor.
 */
export async function dispatchConversion(
  event: ConversionEvent,
  env: ConversionsEnv,
): Promise<ProviderResult[]> {
  const settled = await Promise.allSettled([
    sendTikTok(event, env),
    sendMeta(event, env),
  ]);
  const names = ["tiktok", "meta"];
  return settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : { provider: names[index], ok: false, error: String(result.reason) },
  );
}
