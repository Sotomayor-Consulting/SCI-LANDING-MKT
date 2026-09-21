// ============================================================================
// Interactividad de la página de gracias (todo sin recargar la página):
//  · Prefill del calendario Zcal con datos que llegan por la URL.
//  · Scroll suave al calendario desde cada CTA.
//  · Barra sticky móvil + CTA del header según visibilidad del calendario.
//  · Validación del lead (POST /api/validate-lead) y tracking CAPI
//    (POST /api/tiktok-capi) — Pages Functions de Cloudflare. Sitio estático.
//    Fire-and-forget: nunca bloquea ni recarga.
// ============================================================================

import {
  validateLeadForm,
  bindLeadErrorClearing,
} from "./services/lead-validation";

const VALIDATE_ENDPOINT = "/api/validate-lead";
const CREATE_LEAD_ENDPOINT = "/api/create-lead";
const CAPI_ENDPOINT = "/api/tiktok-capi";

type TrackingPayload = {
  event_name:
    | "ViewContent"
    | "ClickButton"
    | "CompleteRegistration"
    | "Schedule"
    | "Lead";
  event_id: string;
  page_url?: string;
  referrer?: string;
  external_id?: string;
  content_id?: string;
  content_name?: string;
  content_category?: string;
  lead_id?: string;
  // Matching avanzado (el servidor hashea antes de enviar a CAPI).
  email?: string;
  phone?: string;
  ttclid?: string;
  ttp?: string;
  fbp?: string;
  fbc?: string;
};

function readCookie(name: string): string {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : "";
}

/** Señales de TikTok: ttclid (de la URL, persistido) y ttp (cookie _ttp). */
function tiktokIds(): { ttclid?: string; ttp?: string } {
  const fromUrl = new URLSearchParams(window.location.search).get("ttclid") || "";
  let ttclid = fromUrl.trim();
  try {
    if (ttclid) localStorage.setItem("soto_ttclid", ttclid);
    else ttclid = localStorage.getItem("soto_ttclid") || "";
  } catch {
    /* localStorage no disponible */
  }
  const ttp = readCookie("_ttp") || readCookie("ttp");
  return { ttclid: ttclid || undefined, ttp: ttp || undefined };
}

const ZCAL_EMBED_SCRIPT = "https://static.zcal.co/embed/v1/embed.js";
// Índices de respuesta del evento Zcal (ajustar si cambia el orden de preguntas).
const ANSWER = { phone: 0, facturacion: 1, tema: 2, submission: 4 };

const dataLayer = ((window as any).dataLayer = (window as any).dataLayer || []);
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

function newEventId(name: string): string {
  const rand =
    window.crypto && "randomUUID" in window.crypto
      ? window.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `soto_${name}_${rand}`;
}

/**
 * Envía el evento a la Pages Function de CAPI (TikTok/Meta server-side).
 * Fire-and-forget: si algo falla, el flujo del lead continúa igual.
 */
async function sendTracking(payload: TrackingPayload): Promise<void> {
  try {
    await fetch(CAPI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* el tracking es best-effort; nunca interrumpe la navegación */
  }
}

function track(
  name: TrackingPayload["event_name"],
  extra: Partial<TrackingPayload> = {},
  dedupeKey?: string,
): void {
  if (dedupeKey && sessionStorage.getItem(dedupeKey)) return;
  const event_id = extra.event_id || newEventId(name);
  const payload: TrackingPayload = {
    event_name: name,
    event_id,
    page_url: window.location.href,
    referrer: document.referrer || "",
    content_id: "asesoria-llc-post-registro",
    content_name: "Gracias por tu registro - Asesoria LLC",
    content_category: "LLC USA",
    ...tiktokIds(),
    ...extra,
  };
  dataLayer.push({ event: name, event_source: "thank_you_astro", ...payload });
  if ((window as any).ttq?.track) {
    (window as any).ttq.track(name, payload, { event_id });
  }
  void sendTracking(payload);
  if (dedupeKey) sessionStorage.setItem(dedupeKey, event_id);
}

// ---- Embed JS de Zcal -------------------------------------------------------
// Se inyecta una sola vez, ya con el href de #zcal-link prellenado. Zcal monta
// el iframe y auto-ajusta su altura al contenido (iframe-resizer).
let embedMounted = false;
function mountEmbed(): void {
  if (embedMounted) return;
  embedMounted = true;
  watchZcalFrame();
  const script = document.createElement("script");
  script.src = ZCAL_EMBED_SCRIPT;
  script.async = true;
  document.body.appendChild(script);
}

// Oculta la barra de carga cuando Zcal inyecta y termina de cargar su iframe.
function watchZcalFrame(): void {
  const frame = document.getElementById("zcal-frame");
  if (!frame) return;
  const markLoaded = () => frame.setAttribute("data-loaded", "true");
  const attach = (iframe: HTMLIFrameElement) => {
    iframe.addEventListener("load", markLoaded, { once: true });
    // Fallback: si el iframe ya estaba cargado o el evento no dispara.
    setTimeout(markLoaded, 8000);
  };
  const existing = frame.querySelector("iframe");
  if (existing) {
    attach(existing);
    return;
  }
  const observer = new MutationObserver(() => {
    const iframe = frame.querySelector("iframe");
    if (iframe) {
      observer.disconnect();
      attach(iframe);
    }
  });
  observer.observe(frame, { childList: true, subtree: true });
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// ---- Gate de agenda: formulario → validación → calendario -------------------
// 1. El usuario completa Nombre/Email/Teléfono/facturación/tema.
// 2. Se valida con la Astro Action `validateLead` (Odoo + Google Calendar; hoy
//    un stub con datos de prueba).
// 3. Si el veredicto es OK: se bloquea el contacto, se precarga el link de Zcal
//    (contacto + preguntas + submission_id), se muestra el calendario y se monta
//    el embed. Todo sin recargar la página.
function initScheduleGate(): void {
  const form = document.getElementById("lead-form") as HTMLFormElement | null;
  const leadStep = document.getElementById("lead-step");
  const bookingStep = document.getElementById("booking-step");
  const link = document.getElementById("zcal-link") as HTMLAnchorElement | null;
  const openLink = document.getElementById("zcal-open") as HTMLAnchorElement | null;
  const submitBtn = document.getElementById("lead-submit") as HTMLButtonElement | null;
  const errorAlert = document.getElementById("lead-error");
  const errorMsg = document.getElementById("lead-error-msg");
  const scheduledAlert = document.getElementById("lead-scheduled");
  if (!form || !leadStep || !bookingStep || !link) return;

  // Prefill de comodidad desde la URL (?name=&email=&phone=).
  const q = new URLSearchParams(window.location.search);
  const prefill = (id: string, value: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el && value) el.value = value;
  };
  prefill("lf-name", (q.get("name") || q.get("full_name") || "").trim());
  prefill("lf-email", (q.get("email") || "").trim());
  prefill("lf-phone", (q.get("phone") || q.get("whatsapp") || "").trim());

  // Modo previsualización: ?preview=calendar muestra el calendario directo
  // (sin validar el formulario) para poder ajustar su estilo manualmente.
  if (q.get("preview") === "calendar") {
    leadStep.setAttribute("hidden", "");
    bookingStep.removeAttribute("hidden");
    mountEmbed();
    return;
  }

  let submitting = false;
  const setSubmitting = (value: boolean) => {
    submitting = value;
    if (!submitBtn) return;
    submitBtn.disabled = value;
    submitBtn.textContent = value ? "Validando…" : "Validar y elegir horario";
  };
  const showError = (message: string) => {
    if (errorMsg) errorMsg.textContent = message;
    errorAlert?.classList.remove("hidden");
  };

  // Limpia el error de cada campo en cuanto el usuario lo corrige.
  bindLeadErrorClearing();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    errorAlert?.classList.add("hidden");
    scheduledAlert?.classList.add("hidden");

    // Validación con Zod (servicio): pinta errores por campo y enfoca el primero.
    const result = validateLeadForm(form);
    if (!result.ok) return;

    const { name, email, country, phone: localPhone, facturacion, tema } = result.data;
    const phone = `${country}${localPhone}`;

    setSubmitting(true);

    // 1) Validación (Odoo): BLACKLISTED / EXISTED (+ hasAgenda contra `meetings`).
    let verdict:
      | { ok: boolean; status: string; hasAgenda: boolean; submissionId: string }
      | undefined;
    try {
      const response = await fetch(VALIDATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, facturacion, tema, website: "" }),
      });
      const result = (await response.json().catch(() => null)) as
        | { ok: boolean; status: string; hasAgenda: boolean; submissionId: string }
        | null;
      if (!response.ok || !result || typeof result.ok !== "boolean") {
        showError("No pudimos validar tus datos. Inténtalo nuevamente.");
        setSubmitting(false);
        return;
      }
      verdict = result;
    } catch {
      showError("No pudimos conectar con el servidor. Revisa tu conexión.");
      setSubmitting(false);
      return;
    }

    if (!verdict.ok) {
      if (verdict.status === "BLACKLISTED") {
        showError("Por ahora no podemos continuar con tu registro. Inténtalo de nuevo más tarde.");
      } else if (verdict.hasAgenda) {
        scheduledAlert?.classList.remove("hidden"); // "Ya estás registrado…"
      } else {
        showError("No pudimos validar tus datos. Inténtalo nuevamente.");
      }
      setSubmitting(false);
      return;
    }

    // 2) Registro en Supabase (parte del gate: si falla, no mostramos la agenda).
    try {
      const created = await fetch(CREATE_LEAD_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          countryCode: country,
          phone: localPhone,
          facturacion,
          tema,
          submissionId: verdict.submissionId,
        }),
      });
      const createdBody = (await created.json().catch(() => null)) as { ok?: boolean } | null;
      if (!created.ok || !createdBody?.ok) {
        showError("No pudimos completar tu registro. Inténtalo nuevamente.");
        setSubmitting(false);
        return;
      }
    } catch {
      showError("No pudimos conectar con el servidor. Revisa tu conexión.");
      setSubmitting(false);
      return;
    }

    // OK → precargar el link de Zcal: contacto (bloqueado) + preguntas + submission_id.
    const url = new URL(link.href);
    url.searchParams.set("name", name);
    url.searchParams.set("email", email);
    url.searchParams.set("smsPhone", phone);
    url.searchParams.set(`a${ANSWER.phone}`, phone);
    url.searchParams.set(`a${ANSWER.facturacion}`, facturacion);
    if (tema) url.searchParams.set(`a${ANSWER.tema}`, tema);
    if (verdict.submissionId) {
      url.searchParams.set(`a${ANSWER.submission}`, verdict.submissionId);
    }
    link.href = url.toString();
    if (openLink) openLink.href = url.toString();

    // Resumen de contacto bloqueado.
    setText("lc-name", name);
    setText("lc-email", email);
    setText("lc-phone", phone);

    // Mostrar el calendario, montar el embed, trackear y hacer scroll.
    leadStep.setAttribute("hidden", "");
    bookingStep.removeAttribute("hidden");
    mountEmbed();
    // 3) CAPI registered (CompleteRegistration).
    track(
      "CompleteRegistration",
      {
        content_name: "Registro completado",
        email,
        phone,
        external_id: verdict.submissionId || undefined,
      },
      "soto_event_fired_CompleteRegistration",
    );
    document.getElementById("agendar")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    setSubmitting(false);
  });
}

function scrollToCalendar(source: string): void {
  const cal = document.getElementById("agendar");
  if (!cal) return;
  cal.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  dataLayer.push({ event: "calendar_scroll_cta_clicked", source_context: source });
}

// -----------------------------------------------------------------------------
initScheduleGate();

// CAPI view_page (ViewContent) al cargar la página.
track("ViewContent");

document.querySelectorAll<HTMLElement>("[data-scroll-calendar]").forEach((el) => {
  el.addEventListener("click", (event) => {
    if (el.tagName === "A") event.preventDefault();
    scrollToCalendar(el.getAttribute("data-cta") || "other");
  });
});

document.querySelectorAll<HTMLElement>("[data-track-schedule]").forEach((el) => {
  el.addEventListener("click", () => {
    track("ClickButton", { content_name: "Abrir agenda Zcal" });
  });
});

// CAPI ClickButton en cada CTA.
document.querySelectorAll<HTMLAnchorElement>("a[data-cta]").forEach((a) => {
  a.addEventListener("click", () => {
    const cta = a.getAttribute("data-cta") || "";
    track("ClickButton", { content_name: `CTA ${cta}` });
    dataLayer.push({ event: "cta_click", cta });
  });
});

// ---- Barra sticky móvil: aparece cuando el calendario sale de vista ----------
const sticky = document.getElementById("sticky-bar");
const bookCard = document.getElementById("agendar");
if (sticky && bookCard && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) sticky.removeAttribute("data-on");
        else sticky.setAttribute("data-on", "");
      });
    },
    { threshold: 0 },
  );
  io.observe(bookCard);
}

// ---- CTA del header: aparece al pasar el CTA del hero (evita 2 CTA a la vez) --
const headerCta = document.getElementById("header-cta");
const heroCta = document.getElementById("hero-cta");
if (headerCta && heroCta && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) headerCta.removeAttribute("data-cta-on");
        else headerCta.setAttribute("data-cta-on", "");
      });
    },
    { threshold: 0, rootMargin: "-70px 0px 0px 0px" },
  );
  io.observe(heroCta);
} else if (headerCta) {
  headerCta.setAttribute("data-cta-on", "");
}