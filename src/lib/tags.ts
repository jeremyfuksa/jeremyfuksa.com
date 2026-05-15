import { getCollection, type CollectionEntry } from 'astro:content';

export type PostEntry = CollectionEntry<'posts'>;

export async function getAllPostsSorted(): Promise<PostEntry[]> {
  const entries = await getCollection('posts', (e) =>
    import.meta.env.DEV || !e.data.draft,
  );
  return entries.sort(
    (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
  );
}
