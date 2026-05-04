import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose Tailwind class names with `tailwind-merge` semantics — later
 * utilities win over earlier ones, even when they map to the same
 * underlying CSS property. Used by every shadcn component.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
