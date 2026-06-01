import { describe, expect, it } from 'vitest';
import {
  CategoryFormSchema,
  refineCategoryDepth,
  coerceStatusFilter,
  ItemEditorFormSchema,
  SizeFormSchema,
} from '@/lib/menu/zod-schemas';

describe('CategoryFormSchema (D-4b-07)', () => {
  it('accepts a valid input shape', () => {
    const res = CategoryFormSchema.safeParse({
      name: 'Напитки',
      parentId: null,
      sortOrder: 0,
    });
    expect(res.success).toBe(true);
  });

  it('rejects a name longer than 255 chars (mirrors backend CAT-09 cap)', () => {
    const res = CategoryFormSchema.safeParse({
      name: 'A'.repeat(256),
      parentId: null,
      sortOrder: 0,
    });
    expect(res.success).toBe(false);
  });

  it('rejects an empty name (post-trim)', () => {
    const res = CategoryFormSchema.safeParse({
      name: '   ',
      parentId: null,
      sortOrder: 0,
    });
    expect(res.success).toBe(false);
  });

  it('rejects a negative sortOrder', () => {
    const res = CategoryFormSchema.safeParse({
      name: 'Напитки',
      parentId: null,
      sortOrder: -1,
    });
    expect(res.success).toBe(false);
  });

  it('rejects a non-uuid parentId when not null', () => {
    const res = CategoryFormSchema.safeParse({
      name: 'Кофе',
      parentId: 'not-a-uuid',
      sortOrder: 0,
    });
    expect(res.success).toBe(false);
  });
});

describe('refineCategoryDepth (D-4b-01 — depth ≤ 2)', () => {
  const parentUuid = '11111111-1111-4111-8111-111111111111';
  const childUuid = '22222222-2222-4222-8222-222222222222';
  const map = new Map<string, { parentId: string | null }>([
    [parentUuid, { parentId: null }],
    [childUuid, { parentId: parentUuid }],
  ]);

  it('passes when the picked parent is a top-level category (depth ≤ 2)', () => {
    const refined = refineCategoryDepth(CategoryFormSchema, map);
    const res = refined.safeParse({
      name: 'Кофе',
      parentId: parentUuid,
      sortOrder: 0,
    });
    expect(res.success).toBe(true);
  });

  it('passes when parentId is null (creating a top-level category)', () => {
    const refined = refineCategoryDepth(CategoryFormSchema, map);
    const res = refined.safeParse({
      name: 'Напитки',
      parentId: null,
      sortOrder: 0,
    });
    expect(res.success).toBe(true);
  });

  it('rejects depth-3 attempt with the Russian message on path parentId', () => {
    const refined = refineCategoryDepth(CategoryFormSchema, map);
    const res = refined.safeParse({
      name: 'Эспрессо',
      parentId: childUuid,
      sortOrder: 0,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues[0];
      expect(issue?.path).toEqual(['parentId']);
      expect(issue?.message).toMatch(/Уровень вложенности ограничен двумя/u);
    }
  });
});

describe('ItemEditorFormSchema (Plan 04b-07 Task 1, mirrors CAT-09 caps)', () => {
  const validUuid = '33333333-3333-4333-8333-333333333333';
  const validPayload = {
    name: 'Капучино',
    description: 'Кофейный напиток',
    categoryId: validUuid,
    basePrice: 4.5,
    currency: 'EUR',
    allergens: ['молоко'],
    proteins: 3.2,
    fats: 4.1,
    carbs: 6.8,
    kcal: 80,
    nutritionEstimated: false,
  };

  it('accepts a complete valid payload', () => {
    const res = ItemEditorFormSchema.safeParse(validPayload);
    expect(res.success).toBe(true);
  });

  it('rejects an empty name (post-trim)', () => {
    const res = ItemEditorFormSchema.safeParse({ ...validPayload, name: '   ' });
    expect(res.success).toBe(false);
  });

  it('rejects a basePrice below zero', () => {
    const res = ItemEditorFormSchema.safeParse({ ...validPayload, basePrice: -1 });
    expect(res.success).toBe(false);
  });

  it('accepts proteins=null (nutrition is optional)', () => {
    const res = ItemEditorFormSchema.safeParse({ ...validPayload, proteins: null });
    expect(res.success).toBe(true);
  });

  it('rejects kcal above the 32 000 cap (mirrors backend CAT-09)', () => {
    const res = ItemEditorFormSchema.safeParse({ ...validPayload, kcal: 32001 });
    expect(res.success).toBe(false);
  });

  it('rejects currency that is not 3 uppercase letters', () => {
    const res = ItemEditorFormSchema.safeParse({ ...validPayload, currency: 'eur' });
    expect(res.success).toBe(false);
  });

  it('rejects a stringified basePrice (form layer parses before submit)', () => {
    const res = ItemEditorFormSchema.safeParse({ ...validPayload, basePrice: '4.50' });
    expect(res.success).toBe(false);
  });
});

describe('SizeFormSchema (Plan 04b-07 Task 1)', () => {
  it('accepts a valid size payload', () => {
    const res = SizeFormSchema.safeParse({ name: 'Средняя', price: 5, isDefault: false });
    expect(res.success).toBe(true);
  });

  it('rejects an empty name (post-trim)', () => {
    const res = SizeFormSchema.safeParse({ name: '  ', price: 5, isDefault: false });
    expect(res.success).toBe(false);
  });

  it('rejects a negative price', () => {
    const res = SizeFormSchema.safeParse({ name: 'Средняя', price: -1, isDefault: false });
    expect(res.success).toBe(false);
  });

  it('requires isDefault to be set explicitly (no default)', () => {
    const res = SizeFormSchema.safeParse({ name: 'Средняя', price: 5 });
    expect(res.success).toBe(false);
  });
});

describe('coerceStatusFilter (Plan 04b-06 Task 2)', () => {
  it("defaults to 'all-except-archived' on undefined", () => {
    expect(coerceStatusFilter(undefined)).toBe('all-except-archived');
  });

  it("defaults to 'all-except-archived' on an unknown value", () => {
    expect(coerceStatusFilter('unknown')).toBe('all-except-archived');
  });

  it('passes through known status values', () => {
    expect(coerceStatusFilter('draft')).toBe('draft');
    expect(coerceStatusFilter('published')).toBe('published');
    expect(coerceStatusFilter('paused')).toBe('paused');
    expect(coerceStatusFilter('archived')).toBe('archived');
    expect(coerceStatusFilter('all-except-archived')).toBe('all-except-archived');
  });
});
