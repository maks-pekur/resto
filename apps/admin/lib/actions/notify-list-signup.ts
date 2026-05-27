'use server';

import { z } from 'zod';
import { apiFetch } from '@/lib/api-server';

const EmailSchema = z.object({ email: z.string().email().max(255) });

export interface NotifyListSignupState {
  readonly ok: boolean;
  readonly error: string | null;
}

// CONTEXT D-17 degraded path: weak in-process throttle to prevent log-flood
// DoS when the real `/v1/marketing/notify-list` endpoint is still 404. The
// real per-IP rate limit ships with the Phase 03 api endpoint; this is a
// stopgap, not a security boundary. F-7 revision (CONTEXT) documents the
// MVP-2 backlog item for per-IP rate limiting on the real endpoint.
const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_MAX = 5;
const recentSignups: { ts: number; email: string }[] = [];

const shouldThrottle = (email: string): boolean => {
  const now = Date.now();
  while (recentSignups.length > 0 && now - (recentSignups[0]?.ts ?? 0) > THROTTLE_WINDOW_MS) {
    recentSignups.shift();
  }
  const distinctEmails = new Set(recentSignups.map((s) => s.email));
  if (distinctEmails.size >= THROTTLE_MAX && !distinctEmails.has(email)) {
    return true;
  }
  recentSignups.push({ ts: now, email });
  return false;
};

// Test-only reset hook so `notify-list-signup.spec.ts` can reset the
// process-local throttle window between cases without exporting the
// rolling buffer itself.
export const __resetNotifyListThrottleForTests = (): void => {
  recentSignups.length = 0;
};

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
    // CONTEXT D-17: degrade gracefully when the backend endpoint is not
    // wired yet. Capture the email server-side; Phase 03 / MVP-2 batches
    // the logged emails into the real notify-list once the endpoint
    // exists. pino is not yet a dep of @resto/admin — `console.warn` is
    // the apps/CLAUDE.md-sanctioned structured-logging stopgap.
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
