#!/usr/bin/env node
// One-time migration: pull every post (published + draft) from Ghost,
// convert HTML to Markdown, download images, and write
// Astro content-collection entries.
//
// Run from repo root:
//   cd tools && npm install
//   node migrate-from-ghost.mjs --dry-run
//   node migrate-from-ghost.mjs
//
// Reads GHOST_API=<id>:<secret> from <repo-root>/.env (same as dev/deploy-post.mjs).
// Writes:
//   site/src/content/posts/<slug>.md   (clean conversions)
//   site/src/content/posts/<slug>.mdx  (lossy — raw Ghost HTML preserved per-card)
//   site/src/assets/posts/<slug>/<sha1>-<basename>
//   tools/.migrate-report.json

import { createHmac, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadHtml } from 'cheerio';
import matter from 'gray-matter';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// ---------- CLI ----------

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const GHOST_URL = (arg('ghost-url') || 'https://cms.jeremyfuksa.com').replace(/\/+$/, '');
const CONTENT_DIR = join(repoRoot, arg('content-dir') || 'site/src/content/posts');
const ASSET_DIR = join(repoRoot, arg('asset-dir') || 'site/src/assets/posts');
const INCLUDE_DRAFTS = arg('include-drafts') !== 'false';
const ONLY_SLUG = typeof arg('only-slug') === 'string' ? arg('only-slug') : null;
const DRY_RUN = Boolean(arg('dry-run'));
const FORCE = Boolean(arg('force'));

// ---------- Ghost auth ----------

const envPath = join(repoRoot, '.env');
if (!existsSync(envPath)) {
  console.error(`No .env at ${envPath}. Need GHOST_API=<id>:<secret>.`);
  process.exit(1);
}
const env = await readFile(envPath, 'utf8');
const m = env.match(/^GHOST_API=([^:\s]+):([a-f0-9]+)\s*$/m);
if (!m) {
  console.error('Could not parse GHOST_API=<id>:<secret> from .env');
  process.exit(1);
}
const [, KEY_ID, SECRET_HEX] = m;

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function mintJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', kid: KEY_ID, typ: 'JWT' };
  const payload = { iat: now, exp: now + 300, aud: '/admin/' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac('sha256', Buffer.from(SECRET_HEX, 'hex'))
    .update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

async function ghostGet(path) {
  const res = await fetch(`${GHOST_URL}${path}`, {
    headers: { Authorization: `Ghost ${mintJwt()}` },
  });
  if (!res.ok) {
    throw new Error(`Ghost ${res.status} ${res.statusText} on ${path}`);
  }
  return res.json();
}

// ---------- Fetch all posts ----------

async function fetchAllPosts() {
  const status = INCLUDE_DRAFTS ? '[published,draft]' : 'published';
  const all = [];
  let page = 1;
  for (;;) {
    const qs = new URLSearchParams({
      limit: '100',
      page: String(page),
      formats: 'html',
      include: 'tags,authors',
      filter: `status:${status}`,
    });
    const json = await ghostGet(`/ghost/api/admin/posts/?${qs}`);
    all.push(...json.posts);
    const next = json.meta?.pagination?.next;
    if (!next) break;
    page = next;
  }
  return all;
}

// ---------- Image handling ----------

async function downloadImage(url, outDir, seen) {
  // Strip Ghost CDN size segment to get original.
  const cleaned = url.replace(/\/content\/images\/size\/w\d+\//, '/content/images/');
  const res = await fetch(cleaned);
  if (!res.ok) throw new Error(`Image ${res.status} on ${cleaned}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sha1 = createHash('sha1').update(buf).digest('hex').slice(0, 8);
  if (seen.has(sha1)) return seen.get(sha1);
  const urlBase = basename(new URL(cleaned).pathname);
  const safeBase = urlBase.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = `${sha1}-${safeBase}`;
  const fullPath = join(outDir, filename);
  if (!DRY_RUN) {
    await mkdir(outDir, { recursive: true });
    await writeFile(fullPath, buf);
  }
  seen.set(sha1, filename);
  return filename;
}

// ---------- Ghost card dispositions ----------

const LOSSY_CARD_CLASSES = new Set([
  'kg-bookmark-card',
  'kg-gallery-card',
  'kg-embed-card',
  'kg-toggle-card',
  'kg-button-card',
  'kg-product-card',
  'kg-audio-card',
  'kg-video-card',
  'kg-file-card',
  'kg-nft-card',
  'kg-header-card',
]);

function kgCardClasses($el) {
  const cls = ($el.attr('class') || '').split(/\s+/);
  return cls.filter((c) => c.startsWith('kg-') && c.endsWith('-card'));
}

function isLossyCard($el) {
  const cls = kgCardClasses($el);
  // image-card and callout-card are convertible; everything else is lossy.
  return cls.some((c) => LOSSY_CARD_CLASSES.has(c));
}

// ---------- Per-post transform ----------

function makeStashToken(idx) {
  // Use an HTML comment + a placeholder element. Turndown passes comments through;
  // unknown <ghost-stash> tags get emitted as raw HTML with attributes intact.
  return `<ghost-stash idx="${idx}"></ghost-stash>`;
}

function looksEmpty(html) {
  return !html || !html.replace(/<[^>]+>/g, '').trim();
}

async function transformPost(post, turndown) {
  const slug = post.slug;
  const slugAssetDir = join(ASSET_DIR, slug);
  const seenImages = new Map(); // sha1 prefix -> local filename
  const stashes = []; // raw HTML to splice back in

  let html = post.html || '';
  const $ = loadHtml(`<div id="__root__">${html}</div>`, null, false);

  // 1. Rewrite Ghost cards: convertible inline; lossy stashed.
  $('figure.kg-card').each((_, el) => {
    const $el = $(el);
    if (isLossyCard($el)) {
      const idx = stashes.length;
      stashes.push($.html($el));
      $el.replaceWith(makeStashToken(idx));
      return;
    }
    const cls = kgCardClasses($el);
    if (cls.includes('kg-image-card')) {
      // Reduce to a clean <figure><img><figcaption></figcaption></figure>
      const $img = $el.find('img').first();
      const $cap = $el.find('figcaption').first();
      const cleanFigure = $('<figure></figure>');
      cleanFigure.append($img);
      if ($cap.length) cleanFigure.append($cap);
      $el.replaceWith(cleanFigure);
      return;
    }
    if (cls.includes('kg-callout-card')) {
      const $body = $el.find('.kg-callout-text').first();
      const $emoji = $el.find('.kg-callout-emoji').first();
      const text = ($emoji.text().trim() + ' ' + $body.text().trim()).trim();
      // Replace with a blockquote so turndown emits a `> ` line.
      const $bq = $(`<blockquote>${text}</blockquote>`);
      $el.replaceWith($bq);
      return;
    }
    // Unknown but not in lossy set — stash to be safe.
    const idx = stashes.length;
    stashes.push($.html($el));
    $el.replaceWith(makeStashToken(idx));
  });

  // 2. Collect every <img> (including feature_image set below) and download.
  const imgUrls = new Set();
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && /^https?:\/\//i.test(src)) imgUrls.add(src);
  });

  const featureImage = post.feature_image && /^https?:\/\//i.test(post.feature_image)
    ? post.feature_image : null;
  if (featureImage) imgUrls.add(featureImage);

  const urlToLocal = new Map();
  let imageErrors = 0;
  for (const url of imgUrls) {
    try {
      const filename = await downloadImage(url, slugAssetDir, seenImages);
      // Path relative to .md file in site/src/content/posts/<slug>.md
      urlToLocal.set(url, `../../assets/posts/${slug}/${filename}`);
    } catch (e) {
      console.warn(`  ! image fetch failed for ${url}: ${e.message}`);
      imageErrors++;
    }
  }

  // 3. Rewrite <img src> in the working DOM.
  $('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src && urlToLocal.has(src)) $(el).attr('src', urlToLocal.get(src));
    // Strip Ghost srcset; Astro will generate one from the local image.
    $(el).removeAttr('srcset');
    $(el).removeAttr('sizes');
  });

  // 4. Also rewrite <img src> inside stashed raw HTML.
  for (let i = 0; i < stashes.length; i++) {
    let raw = stashes[i];
    for (const [url, local] of urlToLocal) {
      raw = raw.split(url).join(local);
    }
    stashes[i] = raw;
  }

  // 5. Turndown the cleaned-up HTML.
  const cleanedHtml = $('#__root__').html() || '';
  let body = turndown.turndown(cleanedHtml).trim();

  // 6. Splice stashes back in over the placeholder tokens.
  for (let i = 0; i < stashes.length; i++) {
    // Turndown may have rendered <ghost-stash idx="0"></ghost-stash> as-is, or
    // escaped attribute quotes. Match flexibly.
    const re = new RegExp(`<ghost-stash[^>]*idx="${i}"[^>]*>\\s*</ghost-stash>`);
    if (!re.test(body)) {
      // Fall back: append at end if placeholder was lost (shouldn't happen).
      body = `${body}\n\n${stashes[i]}`;
    } else {
      body = body.replace(re, `\n\n${stashes[i]}\n\n`);
    }
  }

  // 7. Lossy detection.
  const lossyByStash = stashes.length > 0;
  const lossyByEmpty = !looksEmpty(cleanedHtml) && !body.trim();
  const lossy = lossyByStash || lossyByEmpty;

  // 8. Build cover image relative path.
  let coverImagePath = null;
  if (featureImage && urlToLocal.has(featureImage)) {
    coverImagePath = urlToLocal.get(featureImage);
  }

  // 9. Frontmatter.
  const tags = (post.tags || [])
    .filter((t) => t.visibility !== 'internal')
    .map((t) => t.name);

  const fm = {
    title: post.title,
    slug: post.slug,
  };
  const excerpt = (post.custom_excerpt || post.excerpt || '').trim();
  if (excerpt) fm.excerpt = excerpt;
  if (post.published_at) fm.publishedAt = post.published_at;
  if (post.updated_at && post.updated_at !== post.published_at) {
    fm.updatedAt = post.updated_at;
  }
  if (post.featured) fm.featured = true;
  if (post.status !== 'published') fm.draft = true;
  if (tags.length) fm.tags = tags;
  if (post.primary_author?.name) fm.author = post.primary_author.name;
  if (coverImagePath) {
    fm.coverImage = coverImagePath;
    if (post.feature_image_alt) fm.coverImageAlt = post.feature_image_alt;
    if (post.feature_image_caption) fm.coverImageCaption = post.feature_image_caption;
  }
  if (typeof post.reading_time === 'number') fm.readingTime = post.reading_time;

  return {
    slug,
    lossy,
    body,
    frontmatter: fm,
    imageCount: urlToLocal.size,
    imageErrors,
    cardNotes: stashes.length
      ? `${stashes.length} raw card${stashes.length === 1 ? '' : 's'} preserved`
      : '',
  };
}

// ---------- Main ----------

const turndown = new TurndownService({
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
  bulletListMarker: '-',
  emDelimiter: '_',
  hr: '---',
});
turndown.use(gfm);
turndown.keep(['sub', 'sup', 'kbd', 'mark', 'ghost-stash']);
// Clean figure → image + italic caption.
turndown.addRule('figureImage', {
  filter: (node) => node.nodeName === 'FIGURE' && node.querySelector('img'),
  replacement: (_content, node) => {
    const img = node.querySelector('img');
    const cap = node.querySelector('figcaption');
    const alt = (img.getAttribute('alt') || '').replace(/[\[\]]/g, '');
    const src = img.getAttribute('src') || '';
    const line = `![${alt}](${src})`;
    return cap && cap.textContent.trim()
      ? `\n\n${line}\n\n_${cap.textContent.trim()}_\n\n`
      : `\n\n${line}\n\n`;
  },
});

console.log(`Ghost URL: ${GHOST_URL}`);
console.log(`Drafts:    ${INCLUDE_DRAFTS ? 'included' : 'skipped'}`);
console.log(`Dry run:   ${DRY_RUN ? 'yes' : 'NO — files will be written'}`);
console.log('');

const posts = await fetchAllPosts();
let filtered = posts;
if (ONLY_SLUG) filtered = posts.filter((p) => p.slug === ONLY_SLUG);
console.log(`Fetched ${posts.length} posts (processing ${filtered.length}).\n`);

const report = [];
for (const post of filtered) {
  try {
    const r = await transformPost(post, turndown);
    const ext = r.lossy ? 'mdx' : 'md';
    const outPath = join(CONTENT_DIR, `${r.slug}.${ext}`);

    if (!FORCE && !DRY_RUN && existsSync(outPath)) {
      console.warn(`  skip (exists): ${r.slug}.${ext} — pass --force to overwrite`);
      report.push({ slug: r.slug, status: 'skipped', images: r.imageCount, notes: 'exists' });
      continue;
    }

    const file = matter.stringify(r.body, r.frontmatter);
    if (!DRY_RUN) {
      await mkdir(CONTENT_DIR, { recursive: true });
      // If the other extension exists from a prior run, remove it so we don't
      // end up with both <slug>.md and <slug>.mdx (Astro will choke).
      const otherExt = ext === 'md' ? 'mdx' : 'md';
      const otherPath = join(CONTENT_DIR, `${r.slug}.${otherExt}`);
      if (existsSync(otherPath)) await rm(otherPath);
      await writeFile(outPath, file);
    }

    const statusLabel = r.imageErrors
      ? 'partial'
      : r.lossy
        ? 'lossy'
        : 'clean';
    console.log(`  ${statusLabel.padEnd(8)} ${r.slug.padEnd(50)} imgs=${String(r.imageCount).padStart(2)} ${r.cardNotes}`);
    report.push({
      slug: r.slug,
      status: statusLabel,
      file: `${r.slug}.${ext}`,
      images: r.imageCount,
      imageErrors: r.imageErrors,
      notes: r.cardNotes,
    });
  } catch (e) {
    console.error(`  error    ${post.slug.padEnd(50)} ${e.message}`);
    report.push({ slug: post.slug, status: 'error', error: e.message });
  }
}

console.log('');
const counts = report.reduce((acc, r) => {
  acc[r.status] = (acc[r.status] || 0) + 1;
  return acc;
}, {});
console.log('Summary:', counts);

if (!DRY_RUN) {
  await writeFile(
    join(repoRoot, 'tools', '.migrate-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('Report written to tools/.migrate-report.json');
}

if (report.some((r) => r.status === 'error')) {
  process.exit(2);
}
