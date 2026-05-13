# CLAUDE.md

Guidance for Claude Code when working in this repo.

## Project overview

jeremyfuksa.com is a static [Astro](https://astro.build) site. All content
(posts, case studies, home, work, now, about) lives in version-controlled
`.astro`, `.md`, and `.mdx` files in this repo.

The site was previously fed by headless Ghost; that has been retired (May 2026)
and posts now live in `src/content/posts/` as Astro content. Don't
reintroduce a Ghost client, docker container, or `@tryghost/*` dependency
unless explicitly asked.

## Local development

```bash
pnpm install              # first run
pnpm dev                  # http://localhost:4321/
```

Common commands:

```bash
pnpm check     # TypeScript + Astro type check
pnpm test      # vitest (redirects test, no env needed)
pnpm build     # static dist/
pnpm preview   # serve dist/ locally
```

## Deploying to production

Production is a DigitalOcean droplet at `161.35.226.162`. Traefik (TLS)
routes `jeremyfuksa.com` to an `astro-web` nginx container that serves
`/home/admin/jeremyfuksa.com/dist`. A systemd path unit on the host
(`rebuild-jeremyfuksa.path`) watches `~/.rebuild-trigger/rebuild` and
runs `~/rebuild-jeremyfuksa.sh` (git pull + pnpm install + pnpm build).

Deploy flow:

```bash
git push origin main
ssh admin@161.35.226.162 'touch /home/admin/.rebuild-trigger/rebuild'
```

Build takes ~20-30s on the droplet. No cache purge needed — nginx
serves new files on the next request.

## Architecture

### Site source layout
- [src/pages/](src/pages/) — routes. `index.astro`, `now.astro`,
  `about.astro`, `work/index.astro`, `work/[slug].astro`,
  `writing/[slug].astro`, etc. Trailing-slash URLs preserved
  (`trailingSlash: 'always'`, `format: 'directory'`).
- [src/content/posts/](src/content/posts/) — blog posts as
  Markdown with frontmatter, validated by Zod in
  [src/content.config.ts](src/content.config.ts).
- [src/content/case-studies/](src/content/case-studies/) — case
  studies as MDX with Zod-validated frontmatter. One shared
  [CaseStudyLayout.astro](src/components/CaseStudyLayout.astro) renders
  header + sidebar; MDX body fills the prose slot.
- [src/lib/format.ts](src/lib/format.ts) — `isoDate`, `shortDate`,
  `monthYear`, `readingTime`.
- [src/lib/tags.ts](src/lib/tags.ts) — tag aggregation over the
  posts collection.
- [src/redirects.json](src/redirects.json) — flat
  `Record<string, string>` wired into `astro.config.mjs`.
- [public/scripts/main.js](public/scripts/main.js) — vanilla JS
  for theme toggle, TOC scroll spy, heading-anchor copy links,
  reading-progress bar, IntersectionObserver scroll reveal. Respects
  `prefers-reduced-motion`.

### CSS

No preprocessor, no build step. Four files imported in
[src/styles/screen.css](src/styles/screen.css):

- [campfire.css](src/styles/campfire.css) — palette + semantic tokens
  + typography globals (vendored copy of `@jeremyfuksa/campfire` package output)
- [tokens.css](src/styles/tokens.css) — design tokens only (CSS custom
  properties, no selectors). Imports AFTER `campfire.css`, so anything
  declared here overrides campfire defaults.
- [base.css](src/styles/base.css) — reset, heading/body defaults, animations
- [components.css](src/styles/components.css) — all component styles

The shared prose container class on posts and case studies is `.post-prose`.

### Token system

All design values must use CSS custom properties from `tokens.css`. No
hardcoded pixel values in CSS or inline styles in `.astro` files.

**Token categories:** spacing (`--space-*`), typography (`--text-*`,
`--leading-*`, `--weight-*`), tracking (`--tracking-*`), borders
(`--border-hairline`, `--border-thin`, `--border-blockquote`), sizing
(`--size-*`), layout (`--sidebar-*`, `--content-max`, `--prose-max`),
colors, radius, transitions.

**Exceptions (intentionally not tokenized):**
- `font-size: 16px` on `html` (root font size)
- `0.875em` on inline code (relative to parent)
- Animation keyframe values
- Media query breakpoints (CSS vars don't work there)
- Mobile-specific responsive overrides in `@media` blocks

### Typography
- **Headings:** Fraunces (variable font) with `font-variation-settings: 'WONK' 1, 'opsz' 72`. Weights: H1=425, H2=400, H3=400. Display H1 surfaces (`.hero-name`, `.casestudy-title`) match base h1 at 425; H2/H3-class title surfaces in `components.css` use 400. Leading is intentionally tight.
- **Body:** System UI stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `system-ui`, etc.) — no webfont
- **Mono:** Fira Code for dates, read times, code blocks
- **Heading color:** `--color-text-heading` (warm brown light / cream dark)

### Color system

Two accent color roles — never conflate them:
- `--color-accent-ui` — decorative only (borders, underlines, large
  uppercase text). Fails WCAG for body text.
- `--color-accent-text` — all readable text uses of orange/amber. Passes 4.5:1.

Dark mode follows `prefers-color-scheme` by default, with a manual
`.theme-toggle` button that overrides via `data-theme="light|dark"` and
persists to `localStorage`. Both selectors must be honored when adding
theme-aware rules.

## Custom commands

- `/swap-font <name> for <heading|body>` — updates font in
  [src/styles/tokens.css](src/styles/tokens.css) + Google Fonts
  link in [src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro)

## Design constraints (intentional, do not override)

- All values use token variables. No hardcoded pixels in CSS or inline styles.
- Borders use `var(--border-hairline)` (0.5px). The hairline weight is deliberate.
- Prose max-width is `--prose-max: 720px` (single-column reading);
  content max-width is `--content-max: 1280px` (multi-column).
- No JS dependencies. Vanilla JS only, in `public/scripts/main.js`.
  All animations respect `prefers-reduced-motion`.
- Nav logo at 32px uses the simplified SVG mark, not the full wordmark.
- `--color-text-muted` is AA Large only — use for metadata (dates, read
  times), not standalone body text.

## Repo layout

The Astro project lives at the repo root. Other top-level dirs:

- [`deploy/nginx/`](deploy/nginx/) — production nginx config (Link headers
  + markdown content negotiation), bind-mounted into the `astro-web` container
- [`.github/workflows/`](.github/workflows/) — CI (type-check + tests)
- `../ghost-drafts/` (sibling of this repo, not committed) — local markdown
  drafts staged before publishing
