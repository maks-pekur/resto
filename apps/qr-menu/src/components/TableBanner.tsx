import { useState } from 'react';
import { useCartStore } from '@resto/cart';
import { t } from '../i18n';

const TABLE_MAX_LENGTH = 32;

export const sanitizeTable = (raw: string): string | null => {
  const trimmed = raw.trim().slice(0, TABLE_MAX_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
};

export const TableBanner = () => {
  const table = useCartStore((s) => s.table);
  const setTable = useCartStore((s) => s.setTable);
  const [input, setInput] = useState('');

  return (
    <div className="bg-muted border-b">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
        {table ? (
          <>
            <span className="text-sm font-bold">{t('table.current', { table })}</span>
            <button
              type="button"
              onClick={() => {
                setTable(null);
              }}
              className="text-primary-strong focus-visible:ring-ring ml-auto cursor-pointer rounded-full text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('table.change')}
            </button>
          </>
        ) : (
          <form
            className="flex w-full items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const sanitized = sanitizeTable(input);
              if (sanitized) {
                setTable(sanitized);
                setInput('');
              }
            }}
          >
            <label htmlFor="table-input" className="text-muted-foreground text-sm">
              {t('table.prompt')}
            </label>
            <input
              id="table-input"
              value={input}
              maxLength={TABLE_MAX_LENGTH}
              inputMode="numeric"
              onChange={(e) => {
                setInput(e.target.value);
              }}
              className="bg-background focus-visible:ring-ring h-9 w-24 rounded-full border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
            <button
              type="submit"
              className="bg-primary text-primary-foreground focus-visible:ring-ring h-9 cursor-pointer rounded-full px-4 text-sm font-bold focus-visible:ring-2 focus-visible:outline-none"
            >
              {t('table.confirm')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
