import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

export const getStaticPaths = (async () => {
  const studies = await getCollection('case-studies');
  return studies.map((entry) => ({
    params: { slug: entry.id },
    props: { entry },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { entry } = props as { entry: Awaited<ReturnType<typeof getCollection<'case-studies'>>>[number] };
  const d = entry.data;

  const meta = [
    `# ${d.title}`,
    '',
    `*${d.eyebrow}*`,
    '',
    `> ${d.tagline}`,
    '',
    `**Role:** ${d.role}`,
    d.organization ? `**Organization:** ${d.organization}` : null,
    `**Timeline:** ${d.timeline}`,
    '',
  ].filter(Boolean) as string[];

  const body = entry.body ?? '';

  return new Response(meta.join('\n') + '\n' + body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
