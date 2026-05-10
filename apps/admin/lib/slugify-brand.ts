/**
 * Project the operator's free-form brand name into a `BrandSlug`-shaped
 * candidate. Mirrors the server-side `BrandSlug` regex:
 *   `^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$` (3–64 chars).
 *
 * Lossy on purpose:
 *   - NFKD strip diacritics ("Café" → "cafe")
 *   - Non-alphanumeric runs collapse to a single hyphen
 *   - Trim leading/trailing hyphens
 *   - Cap at 64 chars (then re-trim trailing hyphen)
 *
 * Returns the empty string for inputs that contain no usable characters
 * — caller decides whether to keep the field empty or surface "type
 * something with letters" feedback. We intentionally do NOT pad to the
 * 3-char minimum; padding would mask the underlying problem.
 */
export const slugifyBrandName = (raw: string): string => {
  const ascii = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length === 0) return '';
  return ascii.slice(0, 64).replace(/-+$/g, '');
};
