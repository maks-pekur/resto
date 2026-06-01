'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useDebouncedAutosave } from '@/lib/menu/use-auto-save';
import { ModifierGroupFormSchema, type ModifierGroupForm } from '@/lib/menu/zod-schemas';
import type { SaveState } from '@/lib/menu/types';
import { upsertModifierGroupAction } from '../upsert-modifier-group-action';

export interface ModifierGroupFormClientProps {
  readonly initialValues: ModifierGroupForm;
  readonly groupId: string;
  readonly onFirstSave: (newId: string) => void;
  readonly onSaveState: (state: SaveState) => void;
}

export function ModifierGroupFormClient({
  initialValues,
  groupId,
  onFirstSave,
  onSaveState,
}: ModifierGroupFormClientProps): React.ReactElement {
  const router = useRouter();
  const form = useForm<ModifierGroupForm>({
    resolver: zodResolver(ModifierGroupFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  useDebouncedAutosave<ModifierGroupForm>(
    form,
    async (values) => {
      const res = await upsertModifierGroupAction({
        ...(groupId !== 'new' ? { groupId } : {}),
        values,
      });
      if (res.ok && groupId === 'new') {
        onFirstSave(res.id);
        router.replace(`/dashboard/menu/modifier-groups/${res.id}`);
      }
      return { ok: res.ok };
    },
    onSaveState,
  );

  return (
    <Form {...form}>
      <form
        className="grid gap-4 md:grid-cols-[1fr_8rem_8rem]"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название</FormLabel>
              <FormControl>
                <Input maxLength={255} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="minSelectable"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Мин</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  name={field.name}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  value={field.value}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    field.onChange(Number.isFinite(n) ? n : 0);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxSelectable"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Макс</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={99}
                  name={field.name}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  value={field.value}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    field.onChange(Number.isFinite(n) ? n : 0);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
