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
| `rebuild-jeremyfuksa.sh` | `/home/admin/rebuild-jeremyfuksa.sh` | admin:admin 0755 |

The credentials file lives outside the repo because it holds the
`GITHUB_TOKEN`, Home Assistant tokens, and entity IDs.

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

The `astro-web` container's bind mount must point at `dist/client`
(prerendered) and `deploy/nginx` (which contains the `/api/`
reverse-proxy block):

```yaml
services:
  astro-web:
    volumes:
      - ./jeremyfuksa.com/dist/client:/usr/share/nginx/html:ro
      - ./jeremyfuksa.com/deploy/nginx:/etc/nginx/conf.d:ro
```

## Rebuild flow

The existing `rebuild-jeremyfuksa.path` systemd unit fires when
`~/.rebuild-trigger/rebuild` is touched after a push to main. The
script at `/home/admin/rebuild-jeremyfuksa.sh` (mirror of
`rebuild-jeremyfuksa.sh` in this dir) runs:

```
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
sudo -n systemctl restart jeremyfuksa-ssr
```

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
