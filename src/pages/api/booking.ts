import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { z } from "zod";

import { resolveCalnodeEventTypeSlug } from "@/infrastructure/calnode/calnode-event-type";

export const prerender = false;

const bookingSchema = z.object({
  event_type_slug: z.string().optional(),
  start_at: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().max(254).refine(
    (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Correo electrónico inválido.",
  ),
  attendee_phone: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^\+?\(?[0-9][0-9\s\-()]{4,19}$/, "Teléfono inválido.")
    .optional(),
  attendee_phone_country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
  timezone: z.string().trim().max(64).optional(),
  language: z.string().trim().max(8).optional(),
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
      { error: "Nombre, correo, teléfono y horario válido son requeridos." },
      { status: 400 },
    );
  }

  const attendeePhone = parsed.data.attendee_phone;
  const attendeePhoneCountry = parsed.data.attendee_phone_country;
  const shouldSendPhoneCountry =
    attendeePhone && !attendeePhone.startsWith("+") && attendeePhoneCountry;

  if (attendeePhone && !attendeePhone.startsWith("+") && !attendeePhoneCountry) {
    return Response.json(
      { error: "Selecciona el país de tu número de teléfono." },
      { status: 400 },
    );
  }

  const startAt = new Date(parsed.data.start_at);
  if (startAt.getTime() < Date.now() - 60_000) {
    return Response.json({ error: "El horario seleccionado ya no está disponible." }, { status: 409 });
  }

  const runtimeEnv = env as Record<string, string | undefined>;
  const apiKey = runtimeEnv.CALNODE_API_KEY;
  const eventTypeSlug = resolveCalnodeEventTypeSlug(
    runtimeEnv,
    parsed.data.event_type_slug,
  );

  if (!eventTypeSlug) {
    return Response.json({ error: "El slug de Calnode no es válido." }, { status: 400 });
  }

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
          ...(attendeePhone ? { attendee_phone: attendeePhone } : {}),
          ...(shouldSendPhoneCountry
            ? { attendee_phone_country: attendeePhoneCountry }
            : {}),
          ...(parsed.data.timezone
            ? { timezone: parsed.data.timezone }
            : {}),
          ...(parsed.data.language
            ? { language: parsed.data.language }
            : {}),
          answers: parsed.data.answers,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = await response.json().catch(() => null);

    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return Response.json(
        { error: "Calnode devolvió una respuesta inválida." },
        { status: 502 },
      );
    }

    if (!response.ok) {
      const record = data as Record<string, unknown>;
      const message =
        typeof record.error === "string"
          ? record.error
          : typeof record.message === "string"
            ? record.message
            : "No fue posible confirmar la reserva.";

      return Response.json({ error: message }, { status: response.status });
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
