interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface FunctionContext {
  request: Request;
  env: Env;
}

const MAX_BODY_SIZE = 16_384;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE_PATTERN = /^\+[1-9]\d{0,3}$/;
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
  maxLength: number,
): string {
  const field = value[key];
  return typeof field === "string" ? field.trim().slice(0, maxLength) : "";
}

function getSupabaseLeadsUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, "");
  return url.endsWith("/rest/v1/leads") ? url : `${url}/rest/v1/leads`;
}

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
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
  const source = getString(body, "source", 80) || "landing";
  const website = getString(body, "website", 200);
  const requestedSubmissionId =
    getString(body, "submissionId", 36) || getString(body, "submission_id", 36);
  const submissionId = requestedSubmissionId || crypto.randomUUID();
  const localPhoneDigits = phone.replace(/\D/g, "").replace(/^0+/, "");
  const phoneNormalized = `${countryCode}${localPhoneDigits}`;

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "invalid";
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "invalid";
  if (!COUNTRY_CODE_PATTERN.test(countryCode)) fieldErrors.countryCode = "invalid";
  if (localPhoneDigits.length < 7 || !/^\+[1-9]\d{7,14}$/.test(phoneNormalized)) {
    fieldErrors.phone = "invalid";
  }
  if (!activity) fieldErrors.activity = "required";
  if (!advice) fieldErrors.advice = "required";
  if (!UUID_PATTERN.test(submissionId)) fieldErrors.submissionId = "invalid";

  if (Object.keys(fieldErrors).length > 0) {
    return json({ error: "validation_failed", fields: fieldErrors }, 422);
  }

  if (website) {
    return json({ ok: true, submissionId }, 200);
  }

  const leadsUrl = new URL(getSupabaseLeadsUrl(env.SUPABASE_URL));
  leadsUrl.searchParams.set("on_conflict", "submission_id");

  let supabaseResponse: Response;
  try {
    supabaseResponse = await fetch(leadsUrl, {
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
        source,
        created_at: new Date().toISOString(),
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

  const records = (await supabaseResponse.json()) as Array<{ id?: string }>;
  return json(
    {
      ok: true,
      id: records[0]?.id ?? null,
      submissionId,
      duplicate: records.length === 0,
    },
    records.length === 0 ? 200 : 201,
  );
}
