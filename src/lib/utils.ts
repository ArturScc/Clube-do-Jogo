import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Fortaleza',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Fortaleza',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Fortaleza',
});

export function formatDate(value?: string | Date | null) {
  if (!value) return '—';
  return dateFormatter.format(new Date(value)).replace('.', '');
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  return dateTimeFormatter.format(new Date(value));
}

export function formatTime(value?: string | Date | null) {
  if (!value) return '';
  return timeFormatter.format(new Date(value));
}

export function formatMonth(month: string, options: { includeYear?: boolean; capitalize?: boolean } = {}) {
  const [year, monthNumber] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    ...(options.includeYear === false ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return options.capitalize === false ? label : label.charAt(0).toUpperCase() + label.slice(1);
}

export function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'America/Fortaleza',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isPastMonth(month: string) {
  return month < monthKey();
}

export function youtubeEmbedUrl(url?: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const videoId = parsed.hostname.includes('youtu.be')
      ? parsed.pathname.slice(1)
      : parsed.searchParams.get('v') ?? parsed.pathname.split('/').pop();
    return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

export function initials(name?: string | null) {
  return (name || 'Membro')
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

export function formatFinishedCount(count: number) {
  return `${count} ${count === 1 ? 'Finalizou' : 'Finalizaram'}`;
}
