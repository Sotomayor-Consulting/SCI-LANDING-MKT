import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { z } from "zod";

export const prerender = false;

const bookingSchema = z.object({
  start_at: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().max(254).refine(
    (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Correo electrónico inválido.",
  ),
  answers: z
    .array(
      z.object({
        question_id: z.string().min(1).max(100),
        value: z.string().max(5_000),
      }),
    )
    .max(100)
    .default([]),
});

export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Origen no permitido." }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser un JSON válido." }, { status: 400 });
  }

  const parsed = bookingSchema.safeParse(rawBody);
  if (!parsed.success || Number.isNaN(Date.parse(parsed.data?.start_at ?? ""))) {
    return Response.json(
      { error: "Nombre, correo y horario válido son requeridos." },
      { status: 400 },
    );
  }

  const startAt = new Date(parsed.data.start_at);
  if (startAt.getTime() < Date.now() - 60_000) {
    return Response.json({ error: "El horario seleccionado ya no está disponible." }, { status: 409 });
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

  try {
    const response = await fetch(
      "https://calnode.sotomayorconsulting.com/v1/bookings",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type_slug: eventTypeSlug,
          start_at: startAt.toISOString(),
          name: parsed.data.name,
          email: parsed.data.email,
          answers: parsed.data.answers,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
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
    console.error("Unable to create Calnode booking", error);
    return Response.json(
      { error: "No fue posible confirmar la reserva." },
      { status: 502 },
    );
  }
};
