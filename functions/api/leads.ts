interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

const MAX_BODY_SIZE = 16_384;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 5_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE_PATTERN = /^\+[1-9]\d{0,2}$/;
const PLATFORM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function getString(
  value: Record<string, unknown>,
  key: string,
  _maxLength: number,
): string {
  const field = value[key];
  return typeof field === "string" ? field.trim() : "";
}

function getSupabaseLeadsUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, "");
  return url.endsWith("/rest/v1/leads") ? url : `${url}/rest/v1/leads`;
}

async function verifyTurnstile(token: string, secret: string, remoteIp: string): Promise<boolean> {
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean };
  return result.success === true;
}

async function fetchWithRetry(url: URL, init: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status !== 408 && response.status !== 429 && response.status < 500) {
        return response;
      }
      if (attempt === MAX_RETRIES - 1) return response;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES - 1) throw error;
    } finally {
      clearTimeout(timeout);
    }

    await new Promise((resolve) => setTimeout(
      resolve,
      250 * (2 ** attempt) + Math.floor(Math.random() * 100),
    ));
  }

  throw lastError;
}

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.TURNSTILE_SECRET_KEY) {
    console.error("Missing required Cloudflare environment variables");
    return json({ error: "server_configuration_error" }, 500);
  }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "unsupported_media_type" }, 415);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_SIZE) {
    return json({ error: "payload_too_large" }, 413);
  }

  let rawBody: string;
  let body: Record<string, unknown>;
  try {
    rawBody = await request.text();
    if (rawBody.length > MAX_BODY_SIZE) {
      return json({ error: "payload_too_large" }, 413);
    }
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "invalid_json" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const name = getString(body, "name", 120);
  const email = getString(body, "email", 254).toLowerCase();
  const countryCode = getString(body, "countryCode", 5) || getString(body, "country", 5);
  const phone = getString(body, "phone", 32);
  const activity = getString(body, "activity", 160);
  const advice = getString(body, "advice", 160);
  const question = getString(body, "question", 2_000);
  const platform = getString(body, "platform", 80) || getString(body, "source", 80) || "landing";
  const sourceDetail = getString(body, "source_detail", 160);
  const utmSource = getString(body, "utm_source", 100);
  const utmMedium = getString(body, "utm_medium", 100);
  const utmCampaign = getString(body, "utm_campaign", 200);
  const utmContent = getString(body, "utm_content", 200);
  const utmTerm = getString(body, "utm_term", 200);
  const gclid = getString(body, "gclid", 512);
  const fbclid = getString(body, "fbclid", 512);
  const website = getString(body, "website", 200);
  const turnstileToken = getString(body, "turnstileToken", 2048);
  const requestedSubmissionId =
    getString(body, "submissionId", 36) || getString(body, "submission_id", 36);
  const submissionId = requestedSubmissionId || crypto.randomUUID();
  const localPhoneDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const phoneNormalized = `${countryCode}${localPhoneDigits}`;

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2 || name.length > 120) fieldErrors.name = "invalid";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) fieldErrors.email = "invalid";
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) fieldErrors.countryCode = "invalid";
  if (
    phone.length < 7
    || phone.length > 32
    || localPhoneDigits.length < 7
    || !/^\+[1-9]\d{7,14}$/.test(phoneNormalized)
  ) {
    fieldErrors.phone = "invalid";
  }
  if (!activity || activity.length > 160) fieldErrors.activity = "invalid";
  if (!advice || advice.length > 160) fieldErrors.advice = "invalid";
  if (question.length > 2_000) fieldErrors.question = "invalid";
  if (!PLATFORM_PATTERN.test(platform)) fieldErrors.platform = "invalid";
  if (sourceDetail.length > 160) fieldErrors.source_detail = "invalid";
  if (utmSource.length > 100) fieldErrors.utm_source = "invalid";
  if (utmMedium.length > 100) fieldErrors.utm_medium = "invalid";
  if (utmCampaign.length > 200) fieldErrors.utm_campaign = "invalid";
  if (utmContent.length > 200) fieldErrors.utm_content = "invalid";
  if (utmTerm.length > 200) fieldErrors.utm_term = "invalid";
  if (gclid.length > 512) fieldErrors.gclid = "invalid";
  if (fbclid.length > 512) fieldErrors.fbclid = "invalid";
  if (!UUID_PATTERN.test(submissionId)) fieldErrors.submissionId = "invalid";

  if (Object.keys(fieldErrors).length > 0) {
    return json({ error: "validation_failed", fields: fieldErrors }, 422);
  }

  if (website) {
    return json({ ok: true, submissionId }, 200);
  }

  if (!turnstileToken) {
    return json({ error: "turnstile_required" }, 422);
  }
  try {
    const validTurnstile = await verifyTurnstile(
      turnstileToken,
      env.TURNSTILE_SECRET_KEY,
      request.headers.get("cf-connecting-ip") || "",
    );
    if (!validTurnstile) return json({ error: "turnstile_failed" }, 403);
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return json({ error: "turnstile_unavailable" }, 503);
  }

  let leadsUrl: URL;
  try {
    leadsUrl = new URL(getSupabaseLeadsUrl(env.SUPABASE_URL));
    if (leadsUrl.protocol !== "https:") throw new Error("Supabase URL must use HTTPS");
  } catch (error) {
    console.error("Invalid Supabase URL", error);
    return json({ error: "server_configuration_error" }, 500);
  }
  leadsUrl.searchParams.set("on_conflict", "submission_id");

  let supabaseResponse: Response;
  try {
    supabaseResponse = await fetchWithRetry(leadsUrl, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({
        submission_id: submissionId,
        name,
        email,
        country_code: countryCode,
        phone,
        phone_normalized: phoneNormalized,
        activity,
        advice,
        question: question || null,
        status: "new",
        platform,
        source_detail: sourceDetail || null,
        utm_source: utmSource || null,
        utm_medium: utmMedium || null,
        utm_campaign: utmCampaign || null,
        utm_content: utmContent || null,
        utm_term: utmTerm || null,
        gclid: gclid || null,
        fbclid: fbclid || null,
        registered_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error("Supabase request failed", error);
    return json({ error: "lead_storage_unavailable" }, 503);
  }

  if (!supabaseResponse.ok) {
    console.error("Supabase insert failed", supabaseResponse.status, await supabaseResponse.text());
    return json({ error: "lead_storage_failed" }, 502);
  }

  let records: unknown;
  try {
    records = await supabaseResponse.json();
  } catch {
    console.error("Supabase insert returned invalid JSON");
    return json({ error: "lead_storage_invalid_response" }, 502);
  }
  if (!Array.isArray(records)) {
    console.error("Supabase insert returned an unexpected response shape");
    return json({ error: "lead_storage_invalid_response" }, 502);
  }
  return json(
    {
      ok: true,
      id: (records[0] as { id?: string } | undefined)?.id ?? null,
      submissionId,
      duplicate: records.length === 0,
    },
    records.length === 0 ? 200 : 201,
  );
}
