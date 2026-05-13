import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { render } from 'astro:content';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { loadRenderers } from 'astro:container';
import { getContainerRenderer as getMDXRenderer } from '@astrojs/mdx';
import { getAllPostsSorted } from '~/lib/tags';

export async function GET(context: APIContext) {
  const posts = await getAllPostsSorted();
  const renderers = await loadRenderers([getMDXRenderer()]);
  const container = await AstroContainer.create({ renderers });

  const items = await Promise.all(
    posts.map(async (entry) => {
      const { Content } = await render(entry);
      const content = await container.renderToString(Content);
      return {
        title: entry.data.title,
        description: entry.data.excerpt,
        pubDate: entry.data.publishedAt,
        link: `/writing/${entry.id}/`,
        content,
      };
    }),
  );

  return rss({
    title: 'The Cocktail Napkin — Jeremy Fuksa',
    description: 'Essays and notes on design, AI, and design systems.',
    site: context.site!,
    items,
    customData: '<language>en-us</language>',
  });
}
