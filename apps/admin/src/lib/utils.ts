import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: string | number, currency: string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(value);
}

export function toMinorUnits(value: string): number {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', frac = ''] = unsigned.split('.');
  const fracPadded = frac.padEnd(2, '0').slice(0, 2);
  const minor = parseInt(whole, 10) * 100 + parseInt(fracPadded, 10);
  return negative ? -minor : minor;
}
