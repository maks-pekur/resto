'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isLocale, LOCALE_COOKIE_NAME, type Locale } from './locales';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface SetLocaleResult {
  readonly ok: boolean;
  readonly locale: Locale | null;
}

export async function setLocaleAction(rawLocale: string): Promise<SetLocaleResult> {
  if (!isLocale(rawLocale)) return { ok: false, locale: null };
  const cookieStore = await cookies();
  cookieStore.set({
    name: LOCALE_COOKIE_NAME,
    value: rawLocale,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_YEAR_SECONDS,
  });
  revalidatePath('/', 'layout');
  return { ok: true, locale: rawLocale };
}
