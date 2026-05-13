import { describe, expect, it } from 'vitest';
import redirects from '../src/redirects.json';

describe('redirects', () => {
  it('redirects legacy /moonbird/ to /work/moonbird/', () => {
    expect(redirects['/moonbird/']).toBe('/work/moonbird/');
  });

  it('redirects /rss/ to /rss.xml', () => {
    expect(redirects['/rss/']).toBe('/rss.xml');
  });

  it('all redirect targets are absolute paths starting with /', () => {
    for (const target of Object.values(redirects)) {
      expect(target).toMatch(/^\//);
    }
  });

  it('no redirect target is also a redirect source (no chains)', () => {
    const sources = new Set(Object.keys(redirects));
    for (const target of Object.values(redirects)) {
      expect(sources.has(target)).toBe(false);
    }
  });
});
