import axios from "axios";

// ============================================================================
// Instancia axios COMPARTIDA por las Pages Functions (proyecto multi-landing).
// Punto único para timeouts/headers/interceptores comunes a todos los equipos.
// En el runtime de Cloudflare (Workers) no hay XHR ni el http de Node: se fuerza
// el adaptador `fetch` (axios ≥ 1.7).
// ============================================================================

export const http = axios.create({
  adapter: "fetch",
  timeout: 8000,
  headers: { "Content-Type": "application/json" },
});
