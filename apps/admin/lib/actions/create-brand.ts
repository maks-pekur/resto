'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BrandSlug } from '@resto/domain';
import { apiFetch } from '@/lib/api-server';

const CreateBrandFormSchema = z.object({
  slug: BrandSlug,
  displayName: z.string().trim().min(1).max(120),
});

export interface CreateBrandActionState {
  readonly error: string | null;
}

interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  message?: string;
  code?: string;
}

interface BrandResponse {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
}

const friendly = (status: number, body: ProblemDetails | null): string => {
  if (status === 409 && body?.code === 'brand.slug_taken') {
    return 'That brand slug is already taken; pick another.';
  }
  if (status === 400) return body?.message ?? body?.detail ?? 'Please check your inputs.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return body?.detail ?? `Request failed (${status.toString()}).`;
};

export async function createBrandAction(
  _prev: CreateBrandActionState,
  formData: FormData,
): Promise<CreateBrandActionState> {
  const parsed = CreateBrandFormSchema.safeParse({
    slug: formData.get('slug'),
    displayName: formData.get('displayName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const { slug, displayName } = parsed.data;

  const res = await apiFetch<BrandResponse | ProblemDetails>('/v1/me/brands', {
    method: 'POST',
    body: { slug, displayName },
  });

  if (!res.ok) {
    return { error: friendly(res.status, (res.data as ProblemDetails | null) ?? null) };
  }

  const cookieStore = await cookies();
  cookieStore.set('resto.active_brand', slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  redirect('/dashboard');
}
