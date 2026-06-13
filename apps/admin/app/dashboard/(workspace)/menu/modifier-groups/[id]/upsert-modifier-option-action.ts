'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api-server';
import { ModifierOptionFormSchema, type ModifierOptionForm } from '@/lib/menu/zod-schemas';
import { toLocalizedText } from '@/lib/menu/localized';
import { friendlyCatalogError, type ProblemDetails } from '@/lib/menu/catalog-errors';

interface UpsertModifierOptionResponse {
  readonly id: string;
}

export interface UpsertModifierOptionInput {
  readonly groupId: string;
  readonly optionId?: string;
  readonly values: ModifierOptionForm;
}

export type UpsertModifierOptionActionResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly error: string };

export async function upsertModifierOptionAction(
  input: UpsertModifierOptionInput,
): Promise<UpsertModifierOptionActionResult> {
  const parsed = ModifierOptionFormSchema.safeParse(input.values);
  if (!parsed.success) {
    const t = await getTranslations('menu.modifiers');
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t('validateOption'),
    };
  }

  const payload: Record<string, unknown> = {
    groupId: input.groupId,
    name: toLocalizedText(parsed.data.name),
    priceDelta: parsed.data.priceDelta.toFixed(2),
    defaultAmount: parsed.data.defaultAmount,
    freeAmount: parsed.data.freeAmount,
  };
  if (input.optionId) payload.id = input.optionId;

  const res = await apiFetch<UpsertModifierOptionResponse>('/v1/catalog/modifier-options', {
    method: 'POST',
    body: payload,
  });
  if (!res.ok || !res.data) {
    return {
      ok: false,
      error: friendlyCatalogError(res.status, res.data as ProblemDetails | null),
    };
  }

  revalidatePath('/dashboard/menu', 'layout');
  revalidatePath(`/dashboard/menu/modifier-groups/${input.groupId}`);
  return { ok: true, id: res.data.id };
}
