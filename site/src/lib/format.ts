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
