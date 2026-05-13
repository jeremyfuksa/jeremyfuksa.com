import { getCollection, type CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;

export function tagSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function getAllPostsSorted(): Promise<PostEntry[]> {
  const entries = await getCollection('posts', (e) =>
    import.meta.env.DEV || !e.data.draft,
  );
  return entries.sort(
    (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
  );
}

export interface TagWithCount {
  name: string;
  slug: string;
  count: number;
}

export async function getAllTagsWithCounts(): Promise<TagWithCount[]> {
  const posts = await getAllPostsSorted();
  const counts = new Map<string, TagWithCount>();
  for (const post of posts) {
    for (const name of post.data.tags) {
      const slug = tagSlug(name);
      const cur = counts.get(slug) ?? { name, slug, count: 0 };
      cur.count += 1;
      counts.set(slug, cur);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export async function getPostsByTagSlug(slug: string): Promise<PostEntry[]> {
  const posts = await getAllPostsSorted();
  return posts.filter((p) => p.data.tags.some((t) => tagSlug(t) === slug));
}
