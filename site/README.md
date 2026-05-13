# jeremyfuksa.com — Astro site

Static Astro site. All content is local — posts under
`src/content/posts/`, case studies under `src/content/case-studies/`,
everything else as `.astro`/`.mdx` routes under `src/pages/`.

## Prerequisites

- Node 22+
- pnpm 10+

## Setup

```bash
cd site
pnpm install
```

## Develop

```bash
pnpm dev              # http://localhost:4321/
```

## Test

```bash
pnpm test             # vitest (redirects test)
pnpm check            # astro check (TypeScript)
```

## Build

```bash
pnpm build            # output in dist/
pnpm preview          # serve dist/ locally
```
