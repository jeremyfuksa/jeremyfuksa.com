/*
  PM2 ecosystem config for jeremyfuksa.com SSR.
  Copy this to /home/admin/ecosystem.config.js on the droplet (outside the
  repo) and fill in real credentials. PM2 reads env from this file and
  passes it to the Node process — credentials never live in git.

  First-time bootstrap on the droplet:
    cd ~ && cp /home/admin/jeremyfuksa.com/deploy/pm2/ecosystem.config.example.js ecosystem.config.js
    # edit ecosystem.config.js with real values
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup        # follow the printed command to enable boot-time start

  Subsequent rebuilds: rebuild-jeremyfuksa.sh runs `pm2 reload jeremyfuksa`
  after the build completes; the file at /home/admin/ecosystem.config.js
  stays the source of truth.
*/

module.exports = {
  apps: [
    {
      name: 'jeremyfuksa',
      script: '/home/admin/jeremyfuksa.com/dist/server/entry.mjs',
      cwd: '/home/admin/jeremyfuksa.com',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 4321,

        // GitHub personal access token, public_repo scope (read-only).
        GITHUB_TOKEN: 'ghp_REPLACE_ME',

        // Nabu Casa base URL (no trailing slash).
        HA_URL: 'https://REPLACE_ME.ui.nabu.casa',

        // Home Assistant long-lived access token.
        HA_TOKEN: 'REPLACE_ME',

        // Entity IDs from HA → Developer Tools → States.
        HA_TEMP_ENTITY: 'sensor.backyard_temperature',
        HA_MEDIA_ENTITY: 'media_player.apple_music',
      },
    },
  ],
};
