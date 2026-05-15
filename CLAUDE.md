# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Project overview

jeremyfuksa.com is an [Astro](https://astro.build) site for "The Cocktail
Napkin" — Jeremy Fuksa's personal professional site. All content (posts,
case studies, home, work, workshop, about, resume) lives in
version-controlled `.astro`, `.md`, and `.mdx` files in this repo.

The site is mostly prerendered. One endpoint — `/api/tinkering.json` —
runs server-side under `@astrojs/node` to pull live signals (GitHub last
push, backyard temperature, now playing) for the homepage tinkering
strip. Everything else is static.

The site was previously fed by headless Ghost; that has been retired
(May 2026) and posts now live in `src/content/posts/` as Astro content.
Don't reintroduce a Ghost client, docker container, or `@tryghost/*`
dependency unless explicitly asked.

## Local development

```bash
pnpm install              # first run
pnpm dev                  # http://localhost:4321/
```

Common commands:

```bash
pnpm check     # TypeScript + Astro type check
pnpm test      # vitest (redirects test, no env needed)
pnpm build     # static dist/client + SSR dist/server/entry.mjs
pnpm preview   # serve dist/ locally
```

To exercise the tinkering strip locally, copy `.env.example` to `.env`
and fill in real values for `GITHUB_TOKEN`, `HA_URL`, `HA_TOKEN`,
`HA_TEMP_ENTITY`, `HA_MEDIA_ENTITY`. Without them the API returns
all-null and the strip renders fallback copy.

## Deploying to production

Production is a DigitalOcean droplet at `161.35.226.162`. Traefik (TLS)
routes `jeremyfuksa.com` to an `astro-web` nginx container that serves
prerendered assets from `/home/admin/jeremyfuksa.com/dist/client`.
Requests to `/api/*` are reverse-proxied to a PM2-managed Node process
on the host that runs the `@astrojs/node` standalone server
(`dist/server/entry.mjs`, listening on `localhost:4321`).

A systemd path unit on the host (`rebuild-jeremyfuksa.path`) watches
`~/.rebuild-trigger/rebuild` and runs `~/rebuild-jeremyfuksa.sh`:
`git pull` → `pnpm install` → `pnpm build` → `pm2 reload jeremyfuksa`.

Deploy flow:

```bash
git push origin main
ssh admin@161.35.226.162 'touch /home/admin/.rebuild-trigger/rebuild'
```

Build takes ~20–30s on the droplet. nginx serves new static files on
the next request; `pm2 reload` swaps the SSR process gracefully.

First-time PM2 bootstrap, env-var setup, nginx-to-SSR wiring, and the
docker-compose changes needed for `host.docker.internal` resolution are
documented in [`deploy/pm2/README.md`](deploy/pm2/README.md).
Tinkering-strip credentials live in `/home/admin/ecosystem.config.js` on
the droplet (out of the repo); the template is at
[`deploy/pm2/ecosystem.config.example.js`](deploy/pm2/ecosystem.config.example.js).

## Architecture

### Site source layout
- [src/pages/](src/pages/) — routes. `index.astro`, `workshop.astro`,
  `about.astro`, `resume.astro`, `work-with-me.astro`,
  `work/index.astro`, `work/[slug].astro`, `writing/index.astro`,
  `writing/[slug].astro`, `api/tinkering.json.ts`. Trailing-slash URLs
  preserved (`trailingSlash: 'always'`, `format: 'directory'`).
- [src/content/posts/](src/content/posts/) — blog posts as Markdown
  with frontmatter, validated by Zod in
  [src/content.config.ts](src/content.config.ts).
- [src/content/case-studies/](src/content/case-studies/) — case studies
  as MDX. One shared
  [CaseStudyLayout.astro](src/components/CaseStudyLayout.astro) renders
  header + sidebar; MDX body fills the prose slot.
- [src/lib/format.ts](src/lib/format.ts) — `isoDate`, `shortDate`,
  `monthYear`, `readingTime`.
- [src/lib/tags.ts](src/lib/tags.ts) — `PostEntry` type +
  `getAllPostsSorted` (tag-aggregation helpers were removed when the
  `/tag/[slug]` routes were retired).
- [src/redirects.json](src/redirects.json) — flat
  `Record<string, string>` wired into `astro.config.mjs`. Currently
  redirects `/now/` → `/workshop/` and `/moonbird/` → `/work/moonbird/`.
- [public/scripts/main.js](public/scripts/main.js) — vanilla JS for
  theme toggle, TOC scroll spy, heading-anchor copy links,
  reading-progress bar, IntersectionObserver scroll reveal. Respects
  `prefers-reduced-motion`.
- [public/print-resume.css](public/print-resume.css) — print stylesheet
  for `/resume/`. Loaded only on that page via BaseLayout's `head` slot.

### CSS

No preprocessor. Four imports in
[src/styles/screen.css](src/styles/screen.css):

- `@jeremyfuksa/campfire/styles.css` — Campfire 1.0.0 from npm. Ships
  the palette, semantic tokens, Hanken Grotesk / Work Sans / Fira Code /
  Fraunces from Google Fonts, dark-mode flip, shadow scale, etc.
- [tokens.css](src/styles/tokens.css) — site-specific deltas only.
  Binds Fraunces to `--font-heading-editorial`, overrides amber accent
  to `warning-700`, bumps dark `--bg-base` to `neutral-900` (airy
  target), fixes dark `--text-secondary` to `neutral-300` (WCAG), plus
  layout / border-width tokens Campfire doesn't ship.
- [base.css](src/styles/base.css) — reset, heading rules using the
  editorial Fraunces token, body wired to `--font-body`, fade-up
  animations.
- [components.css](src/styles/components.css) — all component styles.

The shared prose container class on posts and case studies is
`.post-prose`.

### Token system

All design values bind to CSS custom properties. No hardcoded pixel
values in CSS or inline styles in `.astro` files.

**Token categories:** spacing (`--spacing-*` from Campfire), typography
(`--text-*`, `--heading-*-size/weight/line-height/letter-spacing`,
`--body-*`), borders (`--border-hairline`, `--border-thin`,
`--border-blockquote`), sizing (`--size-*`), layout (`--sidebar-*`,
`--content-max`, `--prose-max`, `--nav-height: 64px`), colors (from
Campfire palette plus `--color-accent-ui` and friends in tokens.css),
radius, transitions.

**Exceptions (intentionally not tokenized):**
- `font-size: 16px` on `html` (root font size)
- `0.875em` on inline code (relative to parent)
- Animation keyframe values
- Media query breakpoints (CSS vars don't work there)
- Mobile-specific responsive overrides in `@media` blocks

### Typography

Four roles, each bound to a specific layer of content:

- **`--font-heading-editorial`** — Fraunces with `'opsz' 144, 'SOFT' 100,
  'WONK' 1`. Hero H1, Principles, post titles, page headers, section
  eyebrows. Declaration layer.
- **`--font-body`** — Hanken Grotesk. Paragraphs, blockquote,
  figcaption. Reading layer.
- **`--font-sans`** — Work Sans. Nav, buttons, labels, inputs,
  metadata. UI layer.
- **`--font-mono`** — Fira Code. Tinkering strip values, dates,
  read-times, code blocks. Signal layer.

Heading color: `--color-text-heading` (warm brown light / warm
off-white `#f5e6d0` dark, AA at 6.46:1 on the article surface).

### Color system

Two accent layers and one spark:

- **`--color-accent-ui`** (amber: `#d97706` light / `#f5a855` dark) —
  the site's workhorse interactive color. Links, active nav states,
  hover states, blockquote rules. Repeats freely.
- **`--spark`** (`#ff5a1f` light / `#ff6b35` dark) — one instance per
  screen, reserved for the tinkering strip live indicator dot. The
  spark earns its intensity by being rare.

Dark mode follows `prefers-color-scheme` by default, with a manual
`.theme-toggle` button that overrides via `data-theme="light|dark"` and
persists to `localStorage`. Both selectors must be honored when adding
theme-aware rules.

The airy-dark surface stack:
- Page body: `neutral-900` (`#2b303b`) — Campfire defaults to
  `neutral-950`; tokens.css bumps it lighter to keep the page open
- Nav / tinkering strip: `neutral-800` (`#42454e`)
- Article surface: `neutral-700` (`#4d515c`) — comes forward
- Footer: `primary-900` (`#303a49`) — intentional temperature break

Body text on the article surface: `neutral-100` (`#edeef1`) at 6.84:1
AA. Muted (`--text-secondary`) overridden to `neutral-300` to keep
metadata legible on the article surface — Campfire ships `neutral-400`
there, which fails AA at 2.77:1.

## Custom commands

- `/swap-font <name> for <heading|body>` — updates font in
  [src/styles/tokens.css](src/styles/tokens.css). Note: Campfire 1.0.0
  loads its own font stack from Google Fonts; swapping fonts now means
  replacing the Campfire-ships values with a local override rather
  than editing a Google Fonts `<link>`.

## Design constraints (intentional, do not override)

- All values bind to token variables. No hardcoded pixels in CSS or
  inline styles.
- Borders use `var(--border-hairline)` (0.5px). The hairline weight is
  deliberate.
- Prose max-width is `--prose-max: 720px` (single-column reading);
  content max-width is `--content-max: 1280px` (multi-column).
- No JS dependencies on the static surfaces. Vanilla JS only, in
  [public/scripts/main.js](public/scripts/main.js). All animations
  respect `prefers-reduced-motion`.
- Nav logo at 32px uses the simplified SVG mark, not the full wordmark.
- Nav order is `Work · Writing · Workshop · About`, with "Work with me"
  set apart as a CTA pill.
- One spark per screen, reserved for the tinkering strip live indicator.
- Restraint rule: every decorative element must justify itself against
  what the type is already doing. If the type does the work, the
  decoration does not belong.

## Repo layout

The Astro project lives at the repo root. Other top-level dirs:

- [`docs/`](docs/) — design rationale documents (master build brief,
  per-page rationale, voice guidelines, copy decks). Authoritative for
  intent; the code is the implementation.
- [`deploy/nginx/`](deploy/nginx/) — production nginx config (Link
  headers, markdown content negotiation, `/api/*` reverse proxy to PM2),
  bind-mounted into the `astro-web` container.
- [`deploy/pm2/`](deploy/pm2/) — PM2 ecosystem template and the deploy
  README for the SSR process on the droplet.
- [`.github/workflows/`](.github/workflows/) — CI (type-check + tests).
- `../ghost-drafts/` (sibling of this repo, not committed) — local
  markdown drafts staged before publishing.
