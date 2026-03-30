import { format } from 'date-fns';

/**
 * Returns a time-aware greeting for the current hour.
 */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Formats a number as USD currency.
 */
export function formatCurrency(
  value: number | undefined | null,
  opts?: { compact?: boolean; decimals?: number }
): string {
  const v = Number(value) || 0;
  const { compact = false, decimals } = opts ?? {};

  if (compact) {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) {
      return `$${(v / 1_000_000).toFixed(decimals ?? 1)}M`;
    }
    if (abs >= 1_000) {
      return `$${(v / 1_000).toFixed(decimals ?? 1)}K`;
    }
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 0,
  }).format(v);
}

/**
 * Formats a date string or Date object into a human-readable format.
 */
export function formatDate(
  date: string | Date,
  pattern: string = 'EEEE, MMMM d, yyyy'
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, pattern);
}

/**
 * Formats a number as a percentage.
 */
export function formatPercent(
  value: number | undefined | null,
  opts?: { decimals?: number }
): string {
  const v = Number(value) || 0;
  const decimals = opts?.decimals ?? 0;
  return `${v.toFixed(decimals)}%`;
}

/**
 * Formats a time string (ISO) to HH:MM in 24-hour format.
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'HH:mm');
}
