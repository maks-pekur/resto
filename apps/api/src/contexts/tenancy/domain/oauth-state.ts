import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const TTL_MS = 10 * 60 * 1000;

export const OAuthStatePayload = z.object({
  brandId: z.string().min(1),
  nonce: z.string().min(1),
  iat: z.number().int().positive(),
});

export type OAuthStatePayload = z.infer<typeof OAuthStatePayload>;

export const OAUTH_NONCE_COOKIE = '__Host-resto_oauth_nonce';

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function constantEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 1);
  const bufA = Buffer.alloc(maxLen, 0);
  const bufB = Buffer.alloc(maxLen, 0);
  bufA.write(a);
  bufB.write(b);
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}

export function encodeOAuthState(payload: Omit<OAuthStatePayload, 'iat'>, secret: string): string {
  const full: OAuthStatePayload = { ...payload, iat: Date.now() };
  const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = sign(encoded, secret);
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(state: string, secret: string): OAuthStatePayload | null {
  const dot = state.lastIndexOf('.');
  if (dot === -1) return null;
  const encoded = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = sign(encoded, secret);
  if (!constantEqual(sig, expected)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = OAuthStatePayload.safeParse(json);
  if (!parsed.success) return null;
  if (Date.now() - parsed.data.iat > TTL_MS) return null;
  return parsed.data;
}
