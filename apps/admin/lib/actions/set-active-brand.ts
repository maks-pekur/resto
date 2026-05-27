'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { BrandSlug } from '@resto/domain';

export interface SetActiveBrandResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Server action: persist the operator's active brand selection to the
 * `resto.active_brand` httpOnly cookie. Pass `null` to switch into
 * "All brands" mode, which deletes the cookie. After the cookie write
 * we revalidate the `/dashboard` layout so the next render picks up
 * the new brand context (the layout reads the cookie and surfaces it to
 * `<AppSidebar>` + every server-side `apiFetch` call).
 */
export async function setActiveBrandAction(slug: string | null): Promise<SetActiveBrandResult> {
  if (slug !== null) {
    const parsed = BrandSlug.safeParse(slug);
    if (!parsed.success) {
      return { ok: false, error: 'Invalid brand slug.' };
    }
  }

  const cookieStore = await cookies();
  if (slug === null) {
    cookieStore.delete('resto.active_brand');
  } else {
    cookieStore.set('resto.active_brand', slug, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }
  revalidatePath('/dashboard', 'layout');
  return { ok: true };
}
