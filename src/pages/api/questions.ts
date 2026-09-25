import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
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
    `https://calnode.sotomayorconsulting.com/v1/event-types/${encodeURIComponent(eventTypeSlug)}/questions`,
  );

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
    console.error("Unable to fetch Calnode questions", error);
    return Response.json(
      { error: "No fue posible consultar las preguntas del agendamiento." },
      { status: 502 },
    );
  }
};
