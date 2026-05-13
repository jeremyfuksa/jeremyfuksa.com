# jeremyfuksa.com

The site for [jeremyfuksa.com](https://jeremyfuksa.com) — a static
[Astro](https://astro.build) site.

## Stack

- **Astro 6+** with MDX
- **Plain CSS** with custom properties; no preprocessor
- **Vanilla JS**, minimal (theme toggle, TOC scroll-spy, reading-progress bar)
- **Fonts** — Fraunces (headings), Fira Code (mono), system UI stack (body)
- **Hosting** — DigitalOcean droplet running Traefik + nginx in Docker

## Repo layout

```
src/pages/           Routes
src/content/         Posts and case studies (MDX), content config
src/lib/             format helpers (dates, reading time)
src/styles/          tokens.css, base.css, components.css, campfire.css, screen.css
public/              Static assets, scripts/main.js
deploy/nginx/        Production nginx config served from astro-web container
.github/workflows/   CI (type-check + tests on PRs and pushes to main)
CLAUDE.md            Detailed guidance for Claude Code agents
```

## Quick start

```bash
pnpm install
pnpm dev                          # http://localhost:4321/
```

Edits under `src/` hot-reload.

## Production deploy

Production is a DigitalOcean droplet (`161.35.226.162`) running Traefik
(TLS) and an `astro-web` nginx container serving `dist/`. A systemd
path unit on the host watches `~/.rebuild-trigger/rebuild` and runs
`rebuild-jeremyfuksa.sh` (git pull + pnpm install + pnpm build) when
the file appears.

```bash
git push origin main
ssh admin@161.35.226.162 'touch /home/admin/.rebuild-trigger/rebuild'
```

## Design system

All spacing, type, color, border, and sizing values come from CSS custom
properties in [src/styles/tokens.css](src/styles/tokens.css).
Hardcoded pixels in CSS or inline styles are off-limits; see [CLAUDE.md](CLAUDE.md)
for the full list of intentional exceptions.

Two accent color roles — do not conflate them:

- `--color-accent-ui` — decorative only (borders, underlines, large uppercase).
- `--color-accent-text` — any readable orange/amber text. Passes 4.5:1.

Dark mode follows `prefers-color-scheme` and exposes a manual `.theme-toggle`
button that overrides via `data-theme="light|dark"` and persists to
`localStorage`.

## CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `pnpm install`,
`pnpm check` (Astro type-check), and `pnpm test` on every PR and push to `main`.

## More

- [CLAUDE.md](CLAUDE.md) — architecture, deploy flow, conventions
- [.claude/commands/](.claude/commands/) — custom slash commands (`/swap-font`)
