import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import redirects from './src/redirects.json' with { type: 'json' };

export default defineConfig({
  site: 'https://jeremyfuksa.com',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  redirects,
  integrations: [mdx(), sitemap()],
});
