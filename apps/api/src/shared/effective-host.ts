/**
 * The host the request was addressed to. When the app sits behind a trusted
 * proxy (`TRUST_PROXY` configured), the original brand subdomain arrives in
 * `x-forwarded-host` (the literal `Host` is the proxy/loopback). We honor it
 * ONLY when trustProxy is on, so an untrusted client cannot spoof a brand.
 * `/v1/menu` is public, and authenticated routes still pass the AuthGuard
 * tenant-mismatch cross-check (RES-172), so this is safe under the gate.
 */
export function effectiveHost(
  headers: Record<string, string | string[] | undefined>,
  trustProxy: boolean,
): string | undefined {
  if (trustProxy) {
    const fwd = headers['x-forwarded-host'];
    const raw = Array.isArray(fwd) ? fwd[0] : fwd;
    const first = raw?.split(',')[0]?.trim();
    if (first) return first;
  }
  const host = headers.host;
  const literal = Array.isArray(host) ? host[0] : host;
  return literal && literal.length > 0 ? literal : undefined;
}
