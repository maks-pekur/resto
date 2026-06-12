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

  if (table) {
    return (
      <div className="table-banner">
        <span>{t('table.current', { table })}</span>
        <button
          type="button"
          onClick={() => {
            setTable(null);
          }}
        >
          {t('table.change')}
        </button>
      </div>
    );
  }

  return (
    <form
      className="table-banner table-banner--entry"
      onSubmit={(e) => {
        e.preventDefault();
        const sanitized = sanitizeTable(input);
        if (sanitized) {
          setTable(sanitized);
          setInput('');
        }
      }}
    >
      <label htmlFor="table-input">{t('table.prompt')}</label>
      <input
        id="table-input"
        value={input}
        maxLength={TABLE_MAX_LENGTH}
        onChange={(e) => {
          setInput(e.target.value);
        }}
      />
      <button type="submit">{t('table.confirm')}</button>
    </form>
  );
};
