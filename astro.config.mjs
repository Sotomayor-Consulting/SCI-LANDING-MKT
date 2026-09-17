// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import icon from 'astro-icon';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // SSR en Cloudflare: habilita las Astro Actions (endpoint /_actions/*).
  // Nota: en modo SSR el adapter genera `_worker.js` y Cloudflare Pages ignora
  // la carpeta `functions/`. Migrar /api/leads y /api/calendar-confirmation a
  // rutas o acciones de Astro antes de desplegar este cambio.
  output: 'server',
  adapter: cloudflare(),

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [icon({
      iconDir: "src/assets/icons",
    })]
});