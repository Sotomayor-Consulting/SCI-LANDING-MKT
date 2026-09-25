import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

export const prerender = false;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;

const parseDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const GET: APIRoute = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const from = requestUrl.searchParams.get("from") ?? "";
  const to = requestUrl.searchParams.get("to") ?? "";
  const fromDate = parseDate(from);
  const toDate = parseDate(to);

  if (!fromDate || !toDate || toDate < fromDate) {
    return Response.json(
      { error: 'Los parámetros "from" y "to" deben ser fechas válidas (YYYY-MM-DD).' },
      { status: 400 },
    );
  }

  const rangeDays = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (rangeDays > MAX_RANGE_DAYS) {
    return Response.json(
      { error: `El rango máximo permitido es de ${MAX_RANGE_DAYS} días.` },
      { status: 400 },
    );
  }

  const runtimeEnv = env as Record<string, string | undefined>;
  const apiKey = runtimeEnv.CALNODE_API_KEY;
  const eventTypeSlug = runtimeEnv.CALNODE_EVENT_TYPE_SLUG ?? "test-SCI";

  if (!apiKey) {
    console.error("CALNODE_API_KEY is not configured");
    return Response.json(
      { error: "El calendario no está configurado temporalmente." },
      { status: 503 },
    );
  }

  const calnodeUrl = new URL(
    `https://calnode.sotomayorconsulting.com/v1/event-types/${encodeURIComponent(eventTypeSlug)}/slots`,
  );
  calnodeUrl.searchParams.set("from", from);
  calnodeUrl.searchParams.set("to", to);

  try {
    const response = await fetch(calnodeUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => null);

    if (data === null) {
      return Response.json(
        { error: "Calnode devolvió una respuesta inválida." },
        { status: 502 },
      );
    }

    return Response.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Unable to fetch Calnode slots", error);
    return Response.json(
      { error: "No fue posible consultar los horarios disponibles." },
      { status: 502 },
    );
  }
};
