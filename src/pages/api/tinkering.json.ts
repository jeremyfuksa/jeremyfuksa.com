/*
  Live signals for the tinkering strip on the homepage. Aggregates:
  - GitHub: most recently pushed public repo + relative time
  - Home Assistant (via Nabu Casa): backyard temperature
  - Home Assistant (via Nabu Casa): now playing on the media player

  Each upstream fails independently via Promise.allSettled. A null in any
  field triggers the client-side fallback copy; the strip never shows an
  error state.
*/

import type { APIRoute } from 'astro';

export const prerender = false;

interface GithubSignal {
  repo: string;
  pushedAt: string;
  relative: string | null;
  stale: boolean;
}

interface TemperatureSignal {
  fahrenheit: number;
  unit: 'F';
  updatedAt: string;
}

interface NowPlayingSignal {
  playing: boolean;
  state: string;
  title?: string | null;
  artist?: string | null;
}

async function fetchGithub(): Promise<GithubSignal> {
  // The /users/{user}/repos endpoint serves public repos without auth.
  // If GITHUB_TOKEN is present and valid, send it for the 5000/hr rate
  // limit; otherwise fall through to the unauthenticated 60/hr limit,
  // which is plenty given the 60s response cache.
  const token = process.env.GITHUB_TOKEN;

  const url =
    'https://api.github.com/users/jeremyfuksa/repos' +
    '?sort=pushed&direction=desc&per_page=1&type=public';

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'jeremyfuksa.com tinkering strip',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const repos = (await res.json()) as Array<{ name: string; pushed_at: string }>;
  const repo = repos[0];
  if (!repo) throw new Error('No repos returned');

  const pushedAt = new Date(repo.pushed_at);
  const diffMs = Date.now() - pushedAt.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  let relative: string | null;
  if (diffMins < 60) relative = `${diffMins}m ago`;
  else if (diffHours < 24) relative = `${diffHours}h ago`;
  else if (diffDays === 1) relative = 'yesterday';
  else if (diffDays < 30) relative = `${diffDays} days ago`;
  else relative = null;

  return {
    repo: repo.name,
    pushedAt: repo.pushed_at,
    relative,
    stale: relative === null,
  };
}

async function fetchHaState(entityId: string) {
  const base = process.env.HA_URL;
  const token = process.env.HA_TOKEN;
  if (!base || !token) throw new Error('HA_URL / HA_TOKEN not set');

  const res = await fetch(`${base}/api/states/${entityId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`HA API ${res.status}`);
  return (await res.json()) as {
    state: string;
    attributes?: Record<string, unknown>;
    last_updated: string;
  };
}

async function fetchTemperature(): Promise<TemperatureSignal> {
  const entity = process.env.HA_TEMP_ENTITY;
  if (!entity) throw new Error('HA_TEMP_ENTITY not set');

  const data = await fetchHaState(entity);
  const state = data.state;
  if (!state || state === 'unavailable' || state === 'unknown') {
    throw new Error('Sensor unavailable');
  }

  const temp = Math.round(parseFloat(state));
  if (Number.isNaN(temp)) throw new Error('Invalid temperature value');

  return {
    fahrenheit: temp,
    unit: 'F',
    updatedAt: data.last_updated,
  };
}

async function fetchNowPlaying(): Promise<NowPlayingSignal> {
  const entity = process.env.HA_MEDIA_ENTITY;
  if (!entity) throw new Error('HA_MEDIA_ENTITY not set');

  const data = await fetchHaState(entity);
  const state = data.state;
  const attrs = data.attributes ?? {};

  if (state !== 'playing') {
    return { playing: false, state };
  }

  const rawTitle = attrs.media_title;
  const rawArtist = attrs.media_artist;
  const artist = typeof rawArtist === 'string' ? rawArtist : null;
  let title = typeof rawTitle === 'string' ? rawTitle : null;
  if (title && title.length > 40) {
    title = title.slice(0, 37) + '...';
  }

  return {
    playing: true,
    state,
    title,
    artist,
  };
}

export const GET: APIRoute = async () => {
  const [github, temperature, nowPlaying] = await Promise.allSettled([
    fetchGithub(),
    fetchTemperature(),
    fetchNowPlaying(),
  ]);

  const body = {
    github: github.status === 'fulfilled' ? github.value : null,
    temperature: temperature.status === 'fulfilled' ? temperature.value : null,
    nowPlaying: nowPlaying.status === 'fulfilled' ? nowPlaying.value : null,
    fetchedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
    },
  });
};
