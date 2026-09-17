interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CALENDAR_WEBHOOK_SECRET: string;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

const MAX_BODY_SIZE = 1_024;
const MAX_EVENT_ID_LENGTH = 255;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 5_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getSupabaseLeadsUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, "");
  return url.endsWith("/rest/v1/leads") ? url : `${url}/rest/v1/leads`;
}

async function secretsMatch(received: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [receivedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const receivedBytes = new Uint8Array(receivedDigest);
  const expectedBytes = new Uint8Array(expectedDigest);
  let difference = 0;

  for (let index = 0; index < receivedBytes.length; index += 1) {
    difference |= receivedBytes[index] ^ expectedBytes[index];
  }

  return difference === 0;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 5_000);
  return null;
}

function parseScheduledAt(value: string): Date | null {
  const match = RFC3339_PATTERN.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const localParts = [year, month, day, hour, minute, second].map(Number);
  const localDate = new Date(Date.UTC(
    localParts[0],
    localParts[1] - 1,
    localParts[2],
    localParts[3],
    localParts[4],
    localParts[5],
  ));
  const isValidCalendarDate = localDate.getUTCFullYear() === localParts[0]
    && localDate.getUTCMonth() === localParts[1] - 1
    && localDate.getUTCDate() === localParts[2]
    && localDate.getUTCHours() === localParts[3]
    && localDate.getUTCMinutes() === localParts[4]
    && localDate.getUTCSeconds() === localParts[5];
  const timestamp = Date.parse(value);

  return isValidCalendarDate && Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

async function patchWithRetry(url: URL, init: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (response.status !== 408 && response.status !== 429 && response.status < 500) return response;
      if (attempt === MAX_RETRIES - 1) return response;

      const delay = parseRetryAfter(response.headers.get("retry-after"))
        ?? 250 * (2 ** attempt) + Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }

  throw lastError;
}

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.CALENDAR_WEBHOOK_SECRET) {
    console.error("Calendar confirmation configuration is incomplete", { requestId });
    return json({ error: "server_configuration_error", requestId }, 500);
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "unsupported_media_type", requestId }, 415);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_SIZE) {
    return json({ error: "payload_too_large", requestId }, 413);
  }

  const receivedSecret = request.headers.get("x-webhook-secret") || "";
  if (!receivedSecret || !(await secretsMatch(receivedSecret, env.CALENDAR_WEBHOOK_SECRET))) {
    console.warn("Rejected calendar confirmation", { requestId });
    return json({ error: "unauthorized", requestId }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_SIZE) {
      return json({ error: "payload_too_large", requestId }, 413);
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "invalid_json", requestId }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json", requestId }, 400);
  }

  const submissionId = typeof body.submission_id === "string" ? body.submission_id.trim() : "";
  const scheduledAt = typeof body.scheduled_at === "string" ? body.scheduled_at.trim() : "";
  const calendarEventId = typeof body.calendar_event_id === "string"
    ? body.calendar_event_id.trim()
    : "";
  const scheduledDate = parseScheduledAt(scheduledAt);

  if (!UUID_PATTERN.test(submissionId)) {
    return json({ error: "invalid_submission_id", requestId }, 422);
  }
  if (!scheduledDate) {
    return json({ error: "invalid_scheduled_at", requestId }, 422);
  }
  if (!calendarEventId || calendarEventId.length > MAX_EVENT_ID_LENGTH) {
    return json({ error: "invalid_calendar_event_id", requestId }, 422);
  }

  let leadsUrl: URL;
  try {
    leadsUrl = new URL(getSupabaseLeadsUrl(env.SUPABASE_URL));
    if (leadsUrl.protocol !== "https:") throw new Error("Supabase URL must use HTTPS");
  } catch (error) {
    console.error("Invalid Supabase URL", { requestId, error });
    return json({ error: "server_configuration_error", requestId }, 500);
  }
  leadsUrl.searchParams.set("submission_id", `eq.${submissionId}`);
  leadsUrl.searchParams.set("select", "id");

  let supabaseResponse: Response;
  try {
    supabaseResponse = await patchWithRetry(leadsUrl, {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        scheduled_at: scheduledDate.toISOString(),
        calendar_event_id: calendarEventId,
      }),
    });
  } catch (error) {
    console.error("Calendar confirmation could not reach Supabase", { requestId, error });
    return json({ error: "lead_storage_unavailable", requestId }, 503);
  }

  if (!supabaseResponse.ok) {
    console.error("Calendar confirmation Supabase PATCH failed", {
      requestId,
      status: supabaseResponse.status,
      response: (await supabaseResponse.text()).slice(0, 500),
    });
    return json({ error: "lead_update_failed", requestId }, 502);
  }

  let records: unknown;
  try {
    records = await supabaseResponse.json();
  } catch {
    return json({ error: "invalid_storage_response", requestId }, 502);
  }
  if (!Array.isArray(records)) {
    return json({ error: "invalid_storage_response", requestId }, 502);
  }
  if (records.length === 0) {
    return json({ error: "lead_not_found", requestId }, 404);
  }

  console.info("Calendar confirmation stored", { requestId });
  return json({ ok: true, requestId });
}
