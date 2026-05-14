# PM2 + Node SSR on the droplet

The site is mostly static (prerendered to `dist/client/`). One endpoint —
`/api/tinkering.json` — runs server-side on the Node server produced by
`@astrojs/node`. PM2 keeps that process alive on the droplet, and the
`astro-web` nginx container reverse-proxies `/api/*` to it.

## First-time bootstrap

On the droplet (`admin@161.35.226.162`):

```bash
# 1. PM2 itself
sudo npm install -g pm2

# 2. Stage the ecosystem config outside the repo
cp /home/admin/jeremyfuksa.com/deploy/pm2/ecosystem.config.example.js \
   /home/admin/ecosystem.config.js
# edit /home/admin/ecosystem.config.js with the real GITHUB_TOKEN,
# HA_URL, HA_TOKEN, HA_TEMP_ENTITY, HA_MEDIA_ENTITY

# 3. Start the process
pm2 start /home/admin/ecosystem.config.js

# 4. Persist + enable boot-time start
pm2 save
pm2 startup
# follow the sudo command pm2 prints, then `pm2 save` again
```

Verify:

```bash
curl -s localhost:4321/api/tinkering.json | jq
```

The JSON should return all three signal slots (`github`, `temperature`,
`nowPlaying`) — populated if creds are valid, `null` if they're not.

## Connecting nginx to PM2

The `astro-web` container reaches the host's PM2 process via
`host.docker.internal:4321`. That hostname only resolves inside the
container when docker-compose explicitly maps it to the host gateway:

```yaml
services:
  astro-web:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Add that to `/home/admin/docker-compose.yml` under the `astro-web`
service and run `docker compose up -d astro-web` to recreate the
container.

## Static-file root change

The nginx container's bind mount used to point at `~/jeremyfuksa.com/dist`.
With SSR enabled, prerendered assets now live under `dist/client`, so the
mount should point there:

```yaml
services:
  astro-web:
    volumes:
      - ./jeremyfuksa.com/dist/client:/usr/share/nginx/html:ro
      - ./jeremyfuksa.com/deploy/nginx:/etc/nginx/conf.d:ro
      # ... (existing TLS / cert mounts unchanged)
```

## Rebuild flow

The existing `rebuild-jeremyfuksa.path` systemd unit fires when
`~/.rebuild-trigger/rebuild` is touched after a push to main. Update
`/home/admin/rebuild-jeremyfuksa.sh` so that after the build it also
reloads PM2:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /home/admin/jeremyfuksa.com
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build

# Reload the Node SSR process (zero-downtime).
pm2 reload jeremyfuksa
```

`pm2 reload` is graceful — PM2 swaps the running process for a new one
without dropping in-flight requests.

## Verify end-to-end after deploy

```bash
# From the droplet:
curl -s localhost:4321/api/tinkering.json | jq      # direct to PM2
curl -s localhost/api/tinkering.json | jq           # through nginx (port 80)

# From anywhere:
curl -s https://jeremyfuksa.com/api/tinkering.json | jq

# And the static surfaces still respond:
curl -sI https://jeremyfuksa.com/ | grep -i ^link
curl -sI https://jeremyfuksa.com/workshop/ | grep -i ^content-type
```
