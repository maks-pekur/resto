/**
 * Cyrillic → Latin table for slug generation. Ukrainian first: `и`→`y`, `и`≠`i`, and `г`→`h`
 * (Ukrainian) rather than `g` (Russian), because the first market is Ukraine and a Kyiv district
 * reads wrong otherwise — "Воскресенка" must become "voskresenka", not "voskresenkha".
 *
 * Only the letters that actually differ are listed; anything absent falls through to NFKD, which
 * already handles accented Latin.
 */
const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
  ъ: '',
  ы: 'y',
  э: 'e',
  ё: 'e',
};

const transliterate = (input: string): string =>
  Array.from(input)
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('');

/**
 * Human name → kebab-case slug. Transliterates Cyrillic before stripping, so a Ukrainian name
 * yields a real slug instead of an empty string — the behaviour before this existed, which made
 * "Воскресенка" unusable as a location name and "Піца Палац" unusable as a tenant name.
 *
 * Returns `''` when nothing survives; callers decide whether that is a validation error or a
 * prompt to type a different name.
 */
export const slugifyName = (raw: string, maxLength = 64): string => {
  const ascii = transliterate(raw.toLowerCase())
    .normalize('NFKD')

    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length === 0) return '';
  return ascii.slice(0, maxLength).replace(/-+$/g, '');
};
