import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: string | number, currency: string): string {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).format(value);
}
