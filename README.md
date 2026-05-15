# jeremyfuksa.com

The site for [jeremyfuksa.com](https://jeremyfuksa.com) — Jeremy
Fuksa's personal professional site, "The Cocktail Napkin." Mostly
prerendered [Astro](https://astro.build), with one SSR endpoint
(`/api/tinkering.json`) feeding the homepage tinkering strip.

## Stack

- **Astro 6+** with MDX, prerendered output with a single SSR route via `@astrojs/node`
- **Campfire 1.0.0** design system ([`@jeremyfuksa/campfire`](https://www.npmjs.com/package/@jeremyfuksa/campfire)) — palette, tokens, fonts, dark-mode flip
- **Plain CSS** with custom properties; no preprocessor
- **Vanilla JS**, minimal — theme toggle, TOC scroll spy, heading-anchor copy links, reading-progress bar, IntersectionObserver scroll reveal
- **Fonts** (loaded by Campfire from Google Fonts) — Fraunces (editorial: hero, headings, principles), Hanken Grotesk (body prose), Work Sans (UI: nav, buttons, labels), Fira Code (mono: code, dates, signal text)
- **Hosting** — DigitalOcean droplet: Traefik (TLS) → `astro-web` nginx container for static assets, with `/api/*` reverse-proxied to a systemd-managed Node SSR process on the host

## Repo layout

```
src/pages/           Routes (incl. api/tinkering.json.ts SSR endpoint)
src/content/         Posts (Markdown) and case studies (MDX), content config
src/lib/             format helpers (dates, reading time), post sorting
src/styles/          tokens.css, base.css, components.css, screen.css, print-resume.css
src/redirects.json   Flat redirect map wired into astro.config.mjs
public/              Static assets, scripts/main.js, print-resume.css
deploy/nginx/        Production nginx config (Link headers, /api/* reverse proxy)
deploy/systemd/      SSR service unit, rebuild script, env template, sudoers fragment
.github/workflows/   CI (type-check + tests on PRs and pushes to main)
docs/                Design rationale documents (intent; code is the implementation)
CLAUDE.md            Detailed guidance for Claude Code agents
```

## Quick start

```bash
pnpm install
pnpm dev                          # http://localhost:4321/
```

Edits under `src/` hot-reload. To exercise the tinkering strip locally,
copy `.env.example` to `.env` and fill in `GITHUB_TOKEN`, `HA_URL`,
`HA_TOKEN`, `HA_TEMP_ENTITY`, `HA_MEDIA_ENTITY`. Without them the API
returns all-null and the strip renders fallback copy.

## Production deploy

Production is a DigitalOcean droplet (`161.35.226.162`). Traefik (TLS)
routes the domain to an `astro-web` nginx container that serves
prerendered assets from `dist/client`. Requests to `/api/*` are
reverse-proxied to a systemd-managed Node process
(`jeremyfuksa-ssr.service`) running the `@astrojs/node` standalone
server. A systemd path unit watches `~/.rebuild-trigger/rebuild` and
runs `rebuild-jeremyfuksa.sh` (git pull → pnpm install → pnpm build →
systemctl restart jeremyfuksa-ssr) when the file appears.

```bash
git push origin main
ssh admin@161.35.226.162 'touch /home/admin/.rebuild-trigger/rebuild'
```

Build takes ~20–30s on the droplet. The SSR restart drops in-flight
requests for ~300ms (homepage tinkering strip only). First-time
systemd, env, and nginx wiring is documented in
[deploy/systemd/README.md](deploy/systemd/README.md).

## Design system

All spacing, type, color, border, and sizing values come from CSS
custom properties — Campfire's tokens plus site-specific overrides in
[src/styles/tokens.css](src/styles/tokens.css). Hardcoded pixels in
CSS or inline styles are off-limits; see [CLAUDE.md](CLAUDE.md) for the
full list of intentional exceptions.

Two accent layers, used at different frequencies:

- `--color-accent-ui` (amber `#d97706` light / `#f5a855` dark) — the workhorse interactive color: links, active nav, hover states, blockquote rules. Repeats freely.
- `--color-spark` (`#ff5a1f` light / `#ff6b35` dark) — one instance per screen, reserved for the tinkering-strip live indicator. The spark earns its intensity by being rare.

Dark mode follows `prefers-color-scheme` and exposes a manual
`.theme-toggle` button that overrides via `data-theme="light|dark"` and
persists to `localStorage`.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `pnpm install`,
`pnpm check` (Astro type-check), and `pnpm test` on every PR and push to `main`.

## More

- [CLAUDE.md](CLAUDE.md) — architecture, deploy flow, conventions
- [.claude/commands/](.claude/commands/) — custom slash commands (`/swap-font`)
