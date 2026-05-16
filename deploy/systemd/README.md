# systemd + Node SSR on the droplet

The site is mostly static (prerendered to `dist/client/`). One endpoint —
`/api/tinkering.json` — runs server-side on the Node server produced by
`@astrojs/node`. A systemd unit on the host keeps that process alive,
and the `astro-web` nginx container reverse-proxies `/api/*` to it.

This replaces an earlier PM2-based setup. systemd is native to the
droplet, matches `rebuild-jeremyfuksa.service` already there, and the
SSR has no zero-downtime-reload requirement worth pulling in another
process manager for.

## Files in this directory

| File | Install path on droplet | Owner / mode |
|---|---|---|
| `jeremyfuksa-ssr.service` | `/etc/systemd/system/jeremyfuksa-ssr.service` | root:root 0644 |
| `jeremyfuksa-ssr.env.example` | `/etc/jeremyfuksa-ssr.env` (filled in) | root:root 0600 |
| `sudoers.d-jeremyfuksa-ssr-restart` | `/etc/sudoers.d/jeremyfuksa-ssr-restart` | root:root 0440 |
| `deploy-jeremyfuksa.sh` | `/home/admin/deploy-jeremyfuksa.sh` | admin:admin 0755 |
| `rebuild-jeremyfuksa.sh` | `/home/admin/rebuild-jeremyfuksa.sh` | admin:admin 0755 |

The credentials file lives outside the repo because it holds the
`GITHUB_TOKEN`, Home Assistant tokens, and entity IDs.

`deploy-jeremyfuksa.sh` is the CI-driven receiver; `rebuild-jeremyfuksa.sh`
is the manual on-droplet fallback. Both end in the same place
(`systemctl restart jeremyfuksa-ssr`) but the CI path skips the
9-minute Sharp pass on this 2GB droplet by doing the build on a GH
Actions runner.

## First-time bootstrap

On the droplet (`admin@161.35.226.162`):

```bash
# 1. Install the unit
sudo install -o root -g root -m 0644 \
  /home/admin/jeremyfuksa.com/deploy/systemd/jeremyfuksa-ssr.service \
  /etc/systemd/system/jeremyfuksa-ssr.service

# 2. Install the credentials file (fill in real values first)
sudo install -o root -g root -m 0600 \
  /home/admin/jeremyfuksa.com/deploy/systemd/jeremyfuksa-ssr.env.example \
  /etc/jeremyfuksa-ssr.env
sudo $EDITOR /etc/jeremyfuksa-ssr.env

# 3. Allow the rebuild script to restart the unit without a password
sudo install -o root -g root -m 0440 \
  /home/admin/jeremyfuksa.com/deploy/systemd/sudoers.d-jeremyfuksa-ssr-restart \
  /etc/sudoers.d/jeremyfuksa-ssr-restart
sudo visudo -c -f /etc/sudoers.d/jeremyfuksa-ssr-restart

# 4. Start + enable
sudo systemctl daemon-reload
sudo systemctl enable --now jeremyfuksa-ssr

# 5. Confirm
systemctl status jeremyfuksa-ssr
curl -s http://127.0.0.1:4321/api/tinkering.json | jq
```

The JSON should return all three signal slots (`github`, `temperature`,
`nowPlaying`) — populated if creds are valid, `null` if they're not.

## Network gotcha — host.docker.internal pinning

The `astro-web` container lives on the docker-compose `proxy` network
(subnet `172.22.0.0/16`, gateway `172.22.0.1`). To reach the host SSR,
it uses `host.docker.internal:4321`.

Docker's `host-gateway` magic value resolves `host.docker.internal` to
the **default bridge's** host IP (`172.17.0.1`) — not the proxy
network's host IP. On this droplet the default `docker0` bridge is
DOWN (no container uses it), so `172.17.0.1` is unreachable. The
result is that `extra_hosts: ["host.docker.internal:host-gateway"]`
silently routes container → host traffic into a dead bridge.

Fix in `docker-compose.yml` — pin the proxy network's gateway directly:

```yaml
services:
  astro-web:
    extra_hosts:
      - "host.docker.internal:172.22.0.1"
```

If the proxy network is ever recreated and the gateway changes, this
needs to be updated. `docker network inspect proxy` shows the current
gateway.

## Network gotcha — UFW

The host runs UFW with default INPUT policy DROP. Allow the proxy
network to reach the SSR port:

```bash
sudo ufw allow from 172.22.0.0/16 to any port 4321 proto tcp \
  comment "astro SSR for proxy network"
```

The SSR listens on `0.0.0.0:4321` (so containers via the proxy gateway
can reach it). UFW enforces the public-internet boundary — port 4321
is not on UFW's allow list for `Anywhere`, so it's not externally
reachable. The only path in is via Traefik → astro-web → host gateway,
which is what we want.

## Static-file root + nginx config

The `astro-web` container binds the **parent** `dist/` (not `dist/client/`)
into `/usr/share/nginx/html/`, and nginx is rooted one level deeper at
`/usr/share/nginx/html/client`. Mounting the parent matters: when a
build fully recreates `dist/client/`, the directory gets a new inode
and a bind mount pointed at `dist/client/` directly would hold the old
(now-deleted) inode and serve an empty root until the container was
recreated. The parent `dist/` is stable across rebuilds — Astro only
recreates its children. (See issue #57 for the incident this prevents.)

```yaml
services:
  astro-web:
    volumes:
      - ./jeremyfuksa.com/dist:/usr/share/nginx/html:ro
      - ./jeremyfuksa.com/deploy/nginx:/etc/nginx/conf.d:ro
```

`dist/server/` ends up visible inside the container at
`/usr/share/nginx/html/server` but is never served — nginx's `root`
is the `client` subdirectory.

## Deploy flow — CI (primary path)

Pushes to `main` trigger `.github/workflows/deploy.yml`. The workflow
installs deps, runs typecheck + tests, builds the site, tars `dist/`,
and pipes the tarball into the droplet over SSH:

```
ssh -i deploy_key admin@161.35.226.162 < dist.tar.gz
```

The deploy SSH key is locked down on the droplet via a `command=`
directive in `~/.ssh/authorized_keys` — it can only invoke
`deploy-jeremyfuksa.sh`. That script:

1. Acquires a flock on `~/.rebuild-trigger/deploy.lock`.
2. Extracts the incoming tar to `~/jeremyfuksa.com/dist-incoming/`.
3. Sanity-checks `client/index.html` and `server/entry.mjs` are present.
4. `rsync -a --delete dist-incoming/ dist/` — files swap in place under
   the bind mount; nginx keeps serving from the same `dist/` inode.
5. `sudo -n systemctl restart jeremyfuksa-ssr` via the same sudoers
   rule the rebuild script uses.

Required GitHub Actions secret:

| Secret | What |
|---|---|
| `DROPLET_DEPLOY_KEY` | The full private key (including header/footer) |

The host fingerprint is scanned at run time via `ssh-keyscan` and
written to a per-run `known_hosts` file — no secret needed for it.
If the droplet's host key ever rotates, the next deploy will simply
pick up the new fingerprint.

## Deploy flow — manual fallback

The existing `rebuild-jeremyfuksa.path` systemd unit still fires when
`~/.rebuild-trigger/rebuild` is touched. The script at
`/home/admin/rebuild-jeremyfuksa.sh` runs:

```
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
sudo -n systemctl restart jeremyfuksa-ssr
```

This path takes ~9 minutes on a 2GB droplet because Sharp image
optimization is CPU-bound, and during that window users see the
in-progress build mid-write. It's the emergency path, not the default.

`systemctl restart` is not zero-downtime; the SSR drops in-flight
requests for ~300ms. The only client of the SSR is the homepage
tinkering strip's lazy fetch — acceptable.

## Verify end-to-end after deploy

```bash
# From the droplet
curl -s http://127.0.0.1:4321/api/tinkering.json | jq     # direct
docker exec astro-web wget -qO- http://host.docker.internal:4321/api/tinkering.json   # through container

# From anywhere
curl -s https://jeremyfuksa.com/api/tinkering.json | jq

# Static surfaces still respond
curl -sI https://jeremyfuksa.com/ | grep -i ^link
curl -sI https://jeremyfuksa.com/workshop/ | grep -i ^content-type
```

## Troubleshooting

| Symptom | Where to look |
|---|---|
| `/api/tinkering.json` returns 404 | `systemctl status jeremyfuksa-ssr` — service may be down |
| Service running, public URL still 404/timeout | `docker exec astro-web wget http://host.docker.internal:4321/...` — bridge / host-gateway misconfig |
| Local curl works, container can't reach | Check `docker-compose.yml` extra_hosts pinning + `ufw status` |
| All-null JSON, HTTP 200 | `/etc/jeremyfuksa-ssr.env` is empty or has wrong creds — expected fallback state |
| Service flapping | `journalctl -u jeremyfuksa-ssr -n 50` — usually missing `entry.mjs` (build didn't run) |
