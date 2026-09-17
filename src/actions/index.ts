import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";

/**
 * Astro Actions — capa de tracking server-side para la página de gracias.
 *
 * ESTADO: ACTIVO. Requiere SSR (output: "server" + adapter Cloudflare, ya
 * configurados en astro.config.mjs). El cliente la invoca con
 * `actions.tracking(...)` desde el <script> de la página, sin recargar.
 *
 * PENDIENTE: rellenar el handler con el reenvío real a TikTok Events API (CAPI),
 * leyendo el token desde las variables de entorno del servidor
 * (context.locals.runtime.env en Cloudflare Workers/Pages).
 */

const trackingInput = z.object({
  event_name: z.enum([
    "ViewContent",
    "Contact",
    "CompleteRegistration",
    "Schedule",
  ]),
  event_id: z.string().min(1).max(200),
  page_url: z.string().url().optional(),
  referrer: z.string().max(2048).optional(),
  ttclid: z.string().max(512).optional(),
  ttp: z.string().max(512).optional(),
  external_id: z.string().max(200).optional(),
  content_id: z.string().max(160).optional(),
  content_name: z.string().max(200).optional(),
  content_category: z.string().max(160).optional(),
  lead_id: z.string().max(160).optional(),
});

export type TrackingInput = z.input<typeof trackingInput>;

// ----------------------------------------------------------------------------
// validateLead — valida el lead antes de mostrar el calendario.
// ----------------------------------------------------------------------------

/**
 * Rangos de facturación. Los valores viajan tal cual a Zcal (respuesta a1) y
 * deben coincidir con las opciones del <Select> del formulario.
 */
export const FACTURACION_OPTIONS = [
  "Aún no factura",
  "Menos de 10.000",
  "Entre 10.000 y 50.000",
  "Entre 50.000 y 100.000",
  "Entre 100.000 y 500.000",
  "Entre 500.000 y 1.000.000",
  "Más de 1.000.000",
] as const;

const validateLeadInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(7).max(20), // E.164 ya normalizado en el cliente
  facturacion: z.enum(FACTURACION_OPTIONS),
  tema: z.string().trim().max(2000).optional().default(""),
  website: z.string().max(200).optional().default(""), // honeypot
});

export type ValidateLeadInput = z.input<typeof validateLeadInput>;
export type LeadVerdict = "ok" | "blacklisted" | "already_scheduled";

/**
 * STUB de validación. El equipo de datos implementará la validación real
 * (axios + Odoo JSON-RPC para lista negra y Google Calendar / Zcal para citas).
 * Mientras tanto, veredicto con datos de prueba según el email:
 *   · contiene "blacklist" o "spam"     → blacklisted
 *   · contiene "agendado" o "scheduled" → already_scheduled
 *   · resto                              → ok
 */
function mockValidate(email: string): LeadVerdict {
  const e = email.toLowerCase();
  if (e.includes("blacklist") || e.includes("spam")) return "blacklisted";
  if (e.includes("agendado") || e.includes("scheduled")) return "already_scheduled";
  return "ok";
}

export const server = {
  validateLead: defineAction({
    accept: "json",
    input: validateLeadInput,
    handler: async (input /* , context */) => {
      // Honeypot: si viene relleno, cortamos en silencio (probable bot).
      if (input.website) {
        return { ok: false, reason: "blacklisted" as LeadVerdict, submissionId: "" };
      }

      // TODO(equipo datos): reemplazar mockValidate por la validación real.
      //   const env = context.locals.runtime.env;
      //   · Odoo JSON-RPC (axios): lista negra por email + phone (input.phone).
      //   · Google Calendar / Zcal: cita existente para ese contacto.
      //   Devolver reason = "blacklisted" | "already_scheduled" | "ok".
      const reason = mockValidate(input.email);
      const submissionId = crypto.randomUUID();
      return { ok: reason === "ok", reason, submissionId };
    },
  }),

  tracking: defineAction({
    accept: "json",
    input: trackingInput,
    handler: async (payload /* , context */) => {
      // TODO(activar SSR): reenviar a TikTok Events API desde el servidor.
      // El token de TikTok debe vivir solo aquí, nunca en el cliente:
      //
      //   const env = context.locals.runtime.env;
      //   const res = await fetch(
      //     `https://business-api.tiktok.com/open_api/v1.3/event/track/`,
      //     { method: "POST", headers: { "Access-Token": env.TIKTOK_ACCESS_TOKEN, ... }, body: ... }
      //   );
      //   if (!res.ok) throw new ActionError({ code: "INTERNAL_SERVER_ERROR" });
      //
      // De momento validamos y confirmamos la recepción del evento.
      if (!payload.event_id) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "event_id requerido para deduplicar el evento.",
        });
      }
      return { ok: true, event_id: payload.event_id };
    },
  }),
};
