import { describe, expect, it } from 'vitest';
import { LOCATION_RESERVED_SLUGS, LocationSlug } from './location-slug';
import { slugifyName } from './slugify';

describe('LocationSlug', () => {
  it('accepts a slug generated from a Cyrillic district name', () => {
    expect(LocationSlug.safeParse(slugifyName('Воскресенка')).success).toBe(true);
  });

  // Each of these already means something in a URL: `new` is the create-form sentinel,
  // `all` is the aggregate mode. A location taking either would shadow it.
  it.each(LOCATION_RESERVED_SLUGS)('refuses the reserved word %s', (word) => {
    expect(LocationSlug.safeParse(word).success).toBe(false);
  });

  it.each(['Voskresenka', 'has space', '-leading', 'ünicode', ''])(
    'refuses the malformed slug %s',
    (bad) => {
      expect(LocationSlug.safeParse(bad).success).toBe(false);
    },
  );
});
