import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BrandSlug } from '@resto/domain';
import { activeBrandCookieSecret } from './env';

const COOKIE_NAME = 'resto.active_brand';
const SEPARATOR = '.';

const sign = (slug: string): string =>
  createHmac('sha256', activeBrandCookieSecret()).update(slug).digest('base64url');

export const signActiveBrand = (slug: string): string => `${slug}${SEPARATOR}${sign(slug)}`;

export const readActiveBrand = async (): Promise<string | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const idx = raw.lastIndexOf(SEPARATOR);
  if (idx <= 0 || idx === raw.length - 1) return null;
  const slugCandidate = raw.slice(0, idx);
  const signature = raw.slice(idx + 1);
  const expected = sign(slugCandidate);
  const a = Buffer.from(signature, 'base64url');
  const b = Buffer.from(expected, 'base64url');
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  const parsed = BrandSlug.safeParse(slugCandidate);
  if (!parsed.success) return null;
  return parsed.data;
};
