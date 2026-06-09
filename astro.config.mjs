// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [tailwind()],
  // Behind Hostinger's HTTPS proxy the internal request is plain HTTP, so
  // Astro builds url.origin as http:// and its CSRF check rejects the
  // https:// Origin header ("Cross-site POST form submissions are forbidden").
  // We protect the POST endpoints with a honeypot + Turnstile instead.
  security: {
    checkOrigin: false,
  },
});
