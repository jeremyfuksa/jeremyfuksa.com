const ghostImageWidths = {
  xxs: 30,
  xs: 100,
  s: 300,
  m: 600,
  l: 1000,
  xl: 2000,
} as const;

export type GhostImageSize = keyof typeof ghostImageWidths;

export function ghostImageUrl(src: string | null, size: GhostImageSize): string | null {
  if (!src) return null;
  if (!src.includes('/content/images/')) return src;
  if (src.includes('/content/images/size/')) return src;
  return src.replace(
    '/content/images/',
    `/content/images/size/w${ghostImageWidths[size]}/`,
  );
}

export function isoDate(date: string | Date): string {
  return new Date(date).toISOString().slice(0, 10);
}

export function shortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function monthYear(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export function readingTime(minutes: number | undefined): string | null {
  if (!minutes) return null;
  return `${minutes} min read`;
}
