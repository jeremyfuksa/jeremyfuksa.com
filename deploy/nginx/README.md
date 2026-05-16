# nginx config for `astro-web`

`default.conf` is a drop-in replacement for the stock
`/etc/nginx/conf.d/default.conf` inside the `astro-web` container. It:

- Serves prerendered Astro output from `/usr/share/nginx/html/client`.
  The host's `~/jeremyfuksa.com/dist/` is bind-mounted to
  `/usr/share/nginx/html/`; nginx is rooted one level deeper at the
  `client` subdirectory so the mount stays valid when Astro recreates
  `dist/client/` during a build (see issue #57).
- Reverse-proxies `/api/*` to the systemd-managed Node SSR process
  running on the host at `localhost:4321` (reached inside the
  container via `host.docker.internal`).
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
      - ./jeremyfuksa.com/dist:/usr/share/nginx/html:ro
      - ./jeremyfuksa.com/deploy/nginx:/etc/nginx/conf.d:ro
    extra_hosts:
      - "host.docker.internal:172.22.0.1"
```

Two production-only details:

1. The static-root mount is the parent `dist/` (not `dist/client/`), and
   nginx is rooted at the `client` subdirectory. Astro fully recreates
   `dist/client/` on builds, which would strand a direct mount on a
   deleted inode and serve an empty root until the container was
   recreated. The parent `dist/` is stable across rebuilds. `dist/server/`
   ends up visible at `/usr/share/nginx/html/server` but is never served.
2. `extra_hosts` pins `host.docker.internal` to the proxy network's
   gateway (`172.22.0.1`) — not Docker's default `host-gateway`, which
   resolves to the `docker0` IP. `docker0` is DOWN on this droplet,
   so packets there go nowhere. Without this pin, the `/api/` upstream
   times out.

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

For the systemd + SSR-process setup that the `/api/` proxy depends on,
see [`deploy/systemd/README.md`](../systemd/README.md).
