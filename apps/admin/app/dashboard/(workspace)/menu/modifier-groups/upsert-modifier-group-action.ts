'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { apiFetchInternal } from '@/lib/api-server-internal';
import { ModifierGroupFormSchema, type ModifierGroupForm } from '@/lib/menu/zod-schemas';
import { toLocalizedText } from '@/lib/menu/localized';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

interface UpsertModifierGroupResponse {
  readonly id: string;
}

export interface UpsertModifierGroupInput {
  readonly groupId?: string;
  readonly values: ModifierGroupForm;
}

export type UpsertModifierGroupActionResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: string };

export async function upsertModifierGroupAction(
  input: UpsertModifierGroupInput,
): Promise<UpsertModifierGroupActionResult> {
  const parsed = ModifierGroupFormSchema.safeParse(input.values);
  if (!parsed.success) {
    const t = await getTranslations('menu.modifiers');
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t('validateGroup'),
    };
  }

  const payload: Record<string, unknown> = {
    name: toLocalizedText(parsed.data.name),
    minSelectable: parsed.data.minSelectable,
    maxSelectable: parsed.data.maxSelectable,
  };
  if (input.groupId) payload.id = input.groupId;

  const res = await apiFetchInternal<UpsertModifierGroupResponse>(
    '/internal/v1/catalog/modifier-groups',
    { method: 'POST', body: payload },
  );
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
    };
  }

  revalidatePath('/dashboard/menu', 'layout');
  revalidatePath(`/dashboard/menu/modifier-groups/${res.data.id}`);
  return { ok: true, id: res.data.id };
}
