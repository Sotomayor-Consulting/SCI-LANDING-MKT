// Servicio de validación del formulario de lead (página de gracias).
// Fuente única de verdad en cliente: esquema Zod + render de errores por campo.
// Mantiene la lógica fuera de gracias.ts. El backend valida por su cuenta.
import { z } from "zod";

export const leadSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Escribe tu nombre completo (al menos 2 caracteres)."),
  email: z.email("Escribe un correo electrónico válido."),
  country: z.string().trim().min(1, "Selecciona tu país."),
  // El teléfono llega tal cual lo escribe el usuario; lo normalizamos a solo
  // dígitos (sin ceros iniciales) y validamos la longitud resultante.
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, "").replace(/^0+/, ""))
    .pipe(
      z
        .string()
        .min(7, "Escribe un número de teléfono válido.")
        .max(15, "El número de teléfono es demasiado largo."),
    ),
  facturacion: z.string().min(1, "Selecciona un rango de facturación."),
  tema: z.string().trim().optional().default(""),
});

export type LeadData = z.output<typeof leadSchema>;
type LeadField = keyof LeadData;

// Campo del esquema → id del control en el DOM (para foco y limpiar el error).
const FIELD_CONTROL: Record<LeadField, string> = {
  name: "lf-name",
  email: "lf-email",
  country: "country",
  phone: "lf-phone",
  facturacion: "lf-facturacion",
  tema: "lf-tema",
};

const FIELDS = Object.keys(FIELD_CONTROL) as LeadField[];

function setFieldError(field: LeadField, message: string | null): void {
  const el = document.getElementById(`err-${field}`);
  if (!el) return;
  if (message) {
    el.textContent = message;
    el.removeAttribute("hidden");
  } else {
    el.textContent = "";
    el.setAttribute("hidden", "");
  }
}

export function clearLeadErrors(): void {
  FIELDS.forEach((field) => setFieldError(field, null));
}

/** Limpia el error de cada campo en cuanto el usuario lo corrige. */
export function bindLeadErrorClearing(): void {
  FIELDS.forEach((field) => {
    const control = document.getElementById(FIELD_CONTROL[field]);
    const clear = () => setFieldError(field, null);
    control?.addEventListener("input", clear);
    control?.addEventListener("change", clear);
  });
}

export type ValidateLeadResult =
  | { ok: true; data: LeadData }
  | { ok: false };

/**
 * Valida el formulario con Zod. Si falla, pinta los errores por campo y
 * enfoca el primero. Devuelve { ok:false } tanto en errores como si el
 * honeypot viene relleno (bot) — el llamador solo debe abortar.
 */
export function validateLeadForm(form: HTMLFormElement): ValidateLeadResult {
  clearLeadErrors();

  const data = new FormData(form);
  // Honeypot anti-bot: si viene relleno, cortamos en silencio.
  if (String(data.get("website") ?? "")) return { ok: false };

  const str = (key: string) => String(data.get(key) ?? "");
  const parsed = leadSchema.safeParse({
    name: str("name"),
    email: str("email"),
    country: str("country"),
    phone: str("phone"),
    facturacion: str("facturacion"),
    tema: str("tema"),
  });

  if (!parsed.success) {
    let firstField: LeadField | null = null;
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as LeadField | undefined;
      if (!field) continue;
      setFieldError(field, issue.message);
      if (!firstField) firstField = field;
    }
    if (firstField) document.getElementById(FIELD_CONTROL[firstField])?.focus();
    return { ok: false };
  }

  return { ok: true, data: parsed.data };
}
