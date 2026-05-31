import { describe, expect, it } from 'vitest';
import { CategoryFormSchema, refineCategoryDepth } from '@/lib/menu/zod-schemas';

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
