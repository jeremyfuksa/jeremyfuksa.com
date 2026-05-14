import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import redirects from './src/redirects.json' with { type: 'json' };

export default defineConfig({
  site: 'https://jeremyfuksa.com',
  // Astro 6 rolled "hybrid" into "static". Per-route opt-in via
  // `export const prerender = false` (see src/pages/api/tinkering.json.ts)
  // marks server-rendered endpoints; everything else stays prerendered.
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  redirects,
  integrations: [mdx(), sitemap()],
});
