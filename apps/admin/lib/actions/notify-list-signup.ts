'use server';

import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';
import { shouldThrottle } from './notify-list-throttle';

const EmailSchema = z.object({ email: z.string().email().max(255) });

export interface NotifyListSignupState {
  readonly ok: boolean;
  readonly error: string | null;
}

export async function notifyListSignupAction(
  _prev: NotifyListSignupState,
  formData: FormData,
): Promise<NotifyListSignupState> {
  const parsed = EmailSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, error: 'Please enter a valid email.' };
  }
  const { email } = parsed.data;
  const res = await apiFetch<{ ok?: boolean }>('/v1/marketing/notify-list', {
    method: 'POST',
    body: { email },
  });
  if (res.status === 404) {
    // CONTEXT D-17: degraded path while /v1/marketing/notify-list 404s; throttle
    // exists because Phase 03 per-IP rate-limit is not yet wired upstream.
    if (!shouldThrottle(email)) {
      console.warn({
        msg: 'ai_notify_list_signup (backend not yet wired)',
        email,
      });
    }
    return { ok: true, error: null };
  }
  if (res.ok) {
    return { ok: true, error: null };
  }
  if (res.status >= 400 && res.status < 500) {
    return { ok: false, error: 'We could not add you to the list. Try again in a moment.' };
  }
  return { ok: false, error: 'Something went wrong. Please try again.' };
}
