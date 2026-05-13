import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const studies = (await getCollection('case-studies')).sort(
    (a, b) => a.data.order - b.data.order,
  );

  const lines = [
    '# Work',
    '',
    '> Selected case studies — design systems, healthcare UX, and the research that became Domain Foundation.',
    '',
  ];

  for (const s of studies) {
    lines.push(`## [${s.data.title}](/work/${s.id}/)`);
    lines.push('');
    lines.push(`*${s.data.eyebrow}*`);
    lines.push('');
    lines.push(s.data.excerpt);
    lines.push('');
  }

  lines.push('## Work with me');
  lines.push('');
  lines.push(
    'Available for design system engagements, UX strategy consulting, and senior design leadership roles. Based in Kansas City, working with teams anywhere.',
  );
  lines.push('');
  lines.push('- Email: [hello@jeremyfuksa.com](mailto:hello@jeremyfuksa.com)');
  lines.push('- [About me →](/about/)');
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
