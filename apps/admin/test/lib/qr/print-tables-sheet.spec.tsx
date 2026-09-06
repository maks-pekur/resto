import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printTablesSheet, type PrintableTable } from '@/lib/qr/print-tables-sheet';

const { createMock, toStringMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  toStringMock: vi.fn(),
}));

vi.mock('qrcode/lib/browser.js', () => ({
  create: createMock,
  toString: toStringMock,
}));

const PRINT_CONTAINER_ID = 'qr-print-sheet-container';

const makeTable = (
  overrides: Partial<PrintableTable> & Pick<PrintableTable, 'number' | 'ordinal'>,
): PrintableTable => ({
  tableId: `table-${overrides.number}`,
  qrUrl: `https://acme.menu.resto.app/?t=table-${overrides.number}`,
  status: 'active',
  ...overrides,
});

const gutterNumbers = (): (string | null)[] => {
  const container = document.getElementById(PRINT_CONTAINER_ID);
  return Array.from(container?.querySelectorAll('.qr-print-gutter') ?? []).map(
    (el) => el.textContent,
  );
};

beforeEach(() => {
  createMock.mockReset();
  createMock.mockReturnValue({ modules: { size: 37, get: () => 0 } });
  toStringMock.mockReset();
  window.print = vi.fn();
});

afterEach(() => {
  window.dispatchEvent(new Event('afterprint'));
});

describe('printTablesSheet — placement (SPEC TBL-10)', () => {
  it('lays out 20 active tables across 4 pages with exactly 20 codes', async () => {
    const tables = Array.from({ length: 20 }, (_, i) =>
      makeTable({ number: String(i + 1), ordinal: i + 1 }),
    );

    await printTablesSheet({ zoneName: 'Terrace', tables });

    const container = document.getElementById(PRINT_CONTAINER_ID);
    expect(container).not.toBeNull();
    expect(container?.querySelectorAll('.qr-print-page').length).toBe(4);
    expect(container?.querySelectorAll('svg.qr-print-code').length).toBe(20);
  });
});

describe('printTablesSheet — ordinal ordering (CONTEXT D-23)', () => {
  it('orders codes by ordinal ascending, never lexicographically by number', async () => {
    const shuffledOrdinals = [
      5, 1, 10, 20, 2, 15, 3, 19, 4, 18, 6, 17, 7, 16, 8, 14, 9, 13, 11, 12,
    ];
    const tables = shuffledOrdinals.map((ordinal) =>
      makeTable({ number: String(ordinal), ordinal }),
    );

    await printTablesSheet({ zoneName: 'Terrace', tables });

    expect(gutterNumbers()).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
  });
});

describe('printTablesSheet — archived exclusion (SPEC TBL-10)', () => {
  it('drops archived tables before layout — they produce no code', async () => {
    const tables = [
      makeTable({ number: '1', ordinal: 1 }),
      makeTable({ number: '2', ordinal: 2, status: 'archived' }),
      makeTable({ number: '3', ordinal: 3 }),
      makeTable({ number: '4', ordinal: 4, status: 'archived' }),
      makeTable({ number: '5', ordinal: 5 }),
      makeTable({ number: '6', ordinal: 6 }),
      makeTable({ number: '7', ordinal: 7 }),
    ];

    await printTablesSheet({ zoneName: 'Terrace', tables });

    const container = document.getElementById(PRINT_CONTAINER_ID);
    expect(container?.querySelectorAll('svg.qr-print-code').length).toBe(5);

    const numbers = gutterNumbers();
    expect(numbers).toHaveLength(5);
    expect(numbers).not.toContain('2');
    expect(numbers).not.toContain('4');
  });
});

describe('printTablesSheet — verbatim qrUrl (CONTEXT D-21)', () => {
  it('hands each table qrUrl to the encoder unchanged — no host, scheme or query composed here', async () => {
    const tables = [
      makeTable({ number: '1', ordinal: 1, qrUrl: 'https://acme.menu.resto.app/?t=table-uuid-1' }),
      makeTable({
        number: '2',
        ordinal: 2,
        qrUrl: 'https://guest.pizza-place.com/?t=table-uuid-2',
      }),
    ];

    await printTablesSheet({ zoneName: 'Terrace', tables });

    expect(createMock).toHaveBeenNthCalledWith(
      1,
      'https://acme.menu.resto.app/?t=table-uuid-1',
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    );
    expect(createMock).toHaveBeenNthCalledWith(
      2,
      'https://guest.pizza-place.com/?t=table-uuid-2',
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    );
  });
});

describe('printTablesSheet — cleanup', () => {
  it('removes the print container and restores the title after afterprint, so printing twice leaves no residue', async () => {
    const originalTitle = document.title;
    const tables = [makeTable({ number: '1', ordinal: 1 })];

    await printTablesSheet({ zoneName: 'Terrace Zone', tables });

    expect(document.getElementById(PRINT_CONTAINER_ID)).not.toBeNull();
    expect(document.title).toBe('Terrace Zone');

    window.dispatchEvent(new Event('afterprint'));

    expect(document.getElementById(PRINT_CONTAINER_ID)).toBeNull();
    expect(document.title).toBe(originalTitle);
  });
});
