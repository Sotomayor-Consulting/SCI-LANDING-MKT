// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';


// https://astro.build/config
export default defineConfig({
  output: 'server',
  session: false,
  adapter: cloudflare({
    imageService: 'compile',
  }),
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [icon({
      iconDir: "src/assets/icons",
    })]
});
