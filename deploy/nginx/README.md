# nginx config for `astro-web`

`default.conf` is a drop-in replacement for the stock
`/etc/nginx/conf.d/default.conf` inside the `astro-web` container. It:

- Serves prerendered Astro output from `/usr/share/nginx/html`
  (bind-mounted from `~/jeremyfuksa.com/dist/client` on the host).
- Reverse-proxies `/api/*` to the PM2-managed Node SSR process running
  on the host at `localhost:4321` (reached inside the container via
  `host.docker.internal`).
- Emits homepage `Link:` response headers (RFC 8288) advertising
  sitemap, RSS, author, and the markdown companion.
- Negotiates `Accept: text/markdown` — trailing-slash URLs rewrite to
  their `.md` companion when the client prefers markdown
  (e.g. `/about/` → `/about.md`, `/work/foo/` → `/work/foo.md`,
  `/` → `/index.md`). HTML stays the default for browsers.
- Serves a branded fallback (`branded-error.html`) for 5xx responses
  and for 404s when `dist/client/404.html` itself is missing (e.g. the
  brief window during `pnpm build`, or a failed deploy that leaves
  `dist/client/` empty). The fallback file is bind-mounted alongside
  the config, so it survives any state of the static root.

## Deploy

This directory is bind-mounted into `astro-web` at `/etc/nginx/conf.d`
via `/home/admin/docker-compose.yml`:

```yaml
services:
  astro-web:
    volumes:
      - ./jeremyfuksa.com/dist/client:/usr/share/nginx/html:ro
      - ./jeremyfuksa.com/deploy/nginx:/etc/nginx/conf.d:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Two production-only changes from the old setup:

1. The static-root mount is `dist/client`, not `dist` — Astro now emits
   prerendered HTML into `dist/client/` and the SSR server into
   `dist/server/`.
2. `extra_hosts` maps `host.docker.internal` to the docker host gateway
   so nginx inside the container can reach the PM2-managed Node process
   listening on `localhost:4321` outside it. Without this, the `/api/`
   upstream resolves to nothing and the tinkering strip stays on its
   fallback copy.

To apply config changes after editing `default.conf`:

```bash
ssh admin@161.35.226.162
docker exec astro-web nginx -t && docker exec astro-web nginx -s reload
```

Note: `Edit`-style atomic-rename writes change the file's inode, which
breaks single-file bind mounts. Mounting the whole directory avoids
that — edits propagate without recreating the container.

## Verify

```bash
# Static-side header / negotiation behavior
curl -sI https://jeremyfuksa.com/ | grep -i ^link
curl -sI -H 'Accept: text/markdown' https://jeremyfuksa.com/about/ | grep -i content-type
curl -sI https://jeremyfuksa.com/about/ | grep -i content-type   # should still be text/html

# SSR endpoint
curl -s https://jeremyfuksa.com/api/tinkering.json | jq
```

For the PM2 + SSR-process setup that the `/api/` proxy depends on, see
[`deploy/pm2/README.md`](../pm2/README.md).
