#!/bin/bash
# Install as /home/admin/rebuild-jeremyfuksa.sh (admin:admin mode 0755).
# Triggered by rebuild-jeremyfuksa.path when ~/.rebuild-trigger/rebuild
# is touched (deploy flow: `git push origin main` then SSH-touch the file).

set -e

export CI=true
export PATH="/home/admin/.nvm/versions/node/v24.12.0/bin:$PATH"

REPO="/home/admin/jeremyfuksa.com"
TRIGGER="/home/admin/.rebuild-trigger/rebuild"
LOG="/home/admin/.rebuild-trigger/rebuild.log"
LOCK="/home/admin/.rebuild-trigger/rebuild.lock"
DEBOUNCE_SECONDS=60

# Only allow one build at a time. If another instance holds the lock,
# this one exits — its trigger has already been absorbed by the running build.
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Build already running, skipping." >> "$LOG"
  exit 0
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Trigger received, debouncing ${DEBOUNCE_SECONDS}s..." >> "$LOG"

# Wait for the storm to pass. Any additional triggers during this window
# just re-touch the (still-present) trigger file — no extra builds queued.
sleep "$DEBOUNCE_SECONDS"

# Consume the trigger right before building so a change made *during* the
# build will create a fresh trigger and queue exactly one follow-up build.
rm -f "$TRIGGER"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Rebuild starting..." >> "$LOG"

cd "$REPO"
git -C "$REPO" pull --ff-only >> "$LOG" 2>&1
pnpm install --frozen-lockfile >> "$LOG" 2>&1
pnpm build >> "$LOG" 2>&1

# Restart the Node SSR process so it loads the freshly built dist/server/.
# Allowed via /etc/sudoers.d/jeremyfuksa-ssr-restart (NOPASSWD, single unit).
sudo -n systemctl restart jeremyfuksa-ssr >> "$LOG" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Rebuild complete." >> "$LOG"
