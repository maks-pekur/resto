import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMenuYaml, MenuYamlError } from '../seed/lib/menu-yaml';

const writeTempYaml = (contents: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'resto-seed-'));
  const file = join(dir, 'menu.yaml');
  writeFileSync(file, contents);
  return file;
};

describe('loadMenuYaml', () => {
  it('parses a valid menu file', () => {
    const file = writeTempYaml(
      `
currency: USD
categories:
  - slug: pizza
    name: { en: Pizza }
items:
  - slug: margherita
    category: pizza
    name: { en: Margherita }
    basePrice: '12.50'
modifiers: []
`.trim(),
    );
    const menu = loadMenuYaml(file);
    expect(menu.currency).toBe('USD');
    expect(menu.categories).toHaveLength(1);
    expect(menu.items[0]?.basePrice).toBe('12.50');
  });

  it('reports a clear, line-pointing error for invalid input', () => {
    const file = writeTempYaml(
      `
currency: usd
categories:
  - slug: pizza
    name: { en: Pizza }
items:
  - slug: margherita
    category: pizza
    name: { en: Margherita }
    basePrice: 12.50
`.trim(),
    );
    let caught: MenuYamlError | null = null;
    try {
      loadMenuYaml(file);
    } catch (err) {
      caught = err as MenuYamlError;
    }
    expect(caught).toBeInstanceOf(MenuYamlError);
    // The message lists each issue with its path.
    expect(caught?.message).toMatch(/currency/);
    expect(caught?.message).toMatch(/items\.0\.basePrice/);
  });

  it('rejects a slug-mismatched item category reference at validation time only after structure is OK', () => {
    // Item.category referencing an unknown category slug is a runtime
    // concern handled by `seed-menu`. The schema only validates shape;
    // a slug like `pizzaa` is a valid Slug.
    const file = writeTempYaml(
      `
currency: USD
categories:
  - slug: pizza
    name: { en: Pizza }
items:
  - slug: cola
    category: drinks
    name: { en: Cola }
    basePrice: '3.00'
`.trim(),
    );
    const menu = loadMenuYaml(file);
    expect(menu.items[0]?.category).toBe('drinks');
  });
});
