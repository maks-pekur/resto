import { timingSafeEqual } from 'node:crypto';

// Padding length for the constant-time compare buffer. Tokens are
// validated by the env schema as `min(16)` and `INTERNAL_API_TOKEN` is
// expected to be 32–64 bytes in production. 256 covers any reasonable
// future increase without truncating real tokens.
export const COMPARE_PAD_LEN = 256;

/**
 * Constant-time string comparison. Both inputs are right-padded to a
 * fixed length so the underlying `timingSafeEqual` does not branch on
 * input length (the previous early `if (a.length !== b.length) return
 * false` leaked the secret length via timing). Length equality is then
 * re-asserted in code to keep correctness.
 *
 * Tokens longer than the pad length compare unequal — acceptable in
 * practice (env schema caps tokens far below the pad).
 */
export const constantTimeStringEqual = (presented: string, expected: string): boolean => {
  if (presented.length > COMPARE_PAD_LEN || expected.length > COMPARE_PAD_LEN) return false;
  const a = Buffer.alloc(COMPARE_PAD_LEN, 0);
  const b = Buffer.alloc(COMPARE_PAD_LEN, 0);
  a.write(presented);
  b.write(expected);
  const equalBuffers = timingSafeEqual(a, b);
  return equalBuffers && presented.length === expected.length;
};
