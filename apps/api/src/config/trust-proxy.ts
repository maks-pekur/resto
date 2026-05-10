/**
 * Parse the validated `TRUST_PROXY` env value into the shape Fastify
 * expects (RES-165). See `env.schema.ts` for the accepted inputs.
 *
 * - unset / '' / 'false' → `false` (do not trust X-Forwarded-*)
 * - 'true'               → `true`  (refused outside dev/test by env schema)
 * - positive integer     → number of trusted proxy hops
 * - comma-separated list → trusted IPs/CIDRs (Fastify accepts an array)
 * - single IP/CIDR       → trusted IP/CIDR (Fastify accepts a string)
 */
export type TrustProxyValue = boolean | number | string | string[];

export const parseTrustProxy = (raw: string | undefined): TrustProxyValue => {
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  const parts = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (parts.length === 0) return false;
  const [first] = parts;
  return parts.length === 1 && first !== undefined ? first : parts;
};
