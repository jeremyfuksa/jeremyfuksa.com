/*
  Proxies the currently-playing track's cover art from Home Assistant.
  HA's entity_picture URL contains a short-lived token and points back
  at the HA host, so we never want browsers fetching it directly —
  this endpoint pulls the bytes server-side and streams them back.

  Returns 404 when nothing is playing, when there is no cover art, or
  when HA is unreachable. The bench's <img> handles a 404 by hiding
  itself, so the fallback path is silent.

  Cached for 60s with a 30s stale-while-revalidate window. The browser
  busts the cache by sending ?v=<artKey> from /api/tinkering.json.
*/

import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const base = process.env.HA_URL;
  const token = process.env.HA_TOKEN;
  const entity = process.env.HA_MEDIA_ENTITY;

  if (!base || !token || !entity) {
    return new Response(null, { status: 404 });
  }

  try {
    const stateRes = await fetch(`${base}/api/states/${entity}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!stateRes.ok) return new Response(null, { status: 404 });

    const data = (await stateRes.json()) as {
      state: string;
      attributes?: Record<string, unknown>;
    };

    if (data.state !== 'playing') return new Response(null, { status: 404 });

    const picture = data.attributes?.entity_picture;
    if (typeof picture !== 'string' || picture.length === 0) {
      return new Response(null, { status: 404 });
    }

    // entity_picture is usually relative ("/api/media_player_proxy/...");
    // resolve against the HA base. If it's already absolute, URL passes
    // it through unchanged.
    const artUrl = new URL(picture, base).toString();

    const artRes = await fetch(artUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!artRes.ok) return new Response(null, { status: 404 });

    const contentType = artRes.headers.get('content-type') ?? 'image/jpeg';
    const body = await artRes.arrayBuffer();

    return new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
};
