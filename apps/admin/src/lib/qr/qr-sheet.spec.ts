import { describe, expect, it } from 'vitest';
import { A4_SHEET, layoutSheet, moduleSizeMm } from './qr-sheet';

describe('layoutSheet', () => {
  it('places 20 codes across exactly 4 pages', () => {
    const placements = layoutSheet(20);
    expect(placements).toHaveLength(20);

    const pages = new Set(placements.map((p) => p.page));
    expect(pages.size).toBe(4);
    expect(Math.max(...pages)).toBe(3);
  });

  it('starts page 1 at index 6', () => {
    const placements = layoutSheet(20);
    expect(placements[5]?.page).toBe(0);
    expect(placements[6]?.page).toBe(1);
  });

  it('orders the first six indices left to right, then top to bottom', () => {
    const placements = layoutSheet(6);
    const columnsAndRows = placements.map((p) => ({ column: p.column, row: p.row }));

    expect(columnsAndRows).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 0, row: 1 },
      { column: 1, row: 1 },
      { column: 0, row: 2 },
      { column: 1, row: 2 },
    ]);
  });

  it('keeps every cut box fully inside the 210 x 297 page', () => {
    const placements = layoutSheet(20);

    for (const placement of placements) {
      expect(placement.cutBoxX).toBeGreaterThanOrEqual(0);
      expect(placement.cutBoxY).toBeGreaterThanOrEqual(0);
      expect(placement.cutBoxX + A4_SHEET.CUT_BOX_MM).toBeLessThanOrEqual(A4_SHEET.PAGE_WIDTH_MM);
      expect(placement.cutBoxY + A4_SHEET.CUT_BOX_MM).toBeLessThanOrEqual(A4_SHEET.PAGE_HEIGHT_MM);
    }
  });

  it('keeps every footprint fully inside its cut box with at least 3mm clearance per side', () => {
    const placements = layoutSheet(20);

    for (const placement of placements) {
      expect(placement.footprintX - placement.cutBoxX).toBeCloseTo(3, 5);
      expect(placement.footprintY - placement.cutBoxY).toBeCloseTo(3, 5);
      expect(
        placement.cutBoxX +
          A4_SHEET.CUT_BOX_MM -
          (placement.footprintX + A4_SHEET.CODE_FOOTPRINT_MM),
      ).toBeCloseTo(3, 5);
      expect(
        placement.cutBoxY +
          A4_SHEET.CUT_BOX_MM -
          (placement.footprintY + A4_SHEET.CODE_FOOTPRINT_MM),
      ).toBeCloseTo(3, 5);
    }
  });

  it('places the gutter baseline below the cut box and above the page edge', () => {
    const placements = layoutSheet(20);

    for (const placement of placements) {
      expect(placement.gutterTextBaselineY).toBeGreaterThan(
        placement.cutBoxY + A4_SHEET.CUT_BOX_MM,
      );
      expect(placement.gutterTextBaselineY).toBeLessThan(
        (placement.row + 1) * A4_SHEET.CELL_HEIGHT_MM,
      );
    }
  });
});

describe('moduleSizeMm', () => {
  it('keeps the quiet zone intact across a symbol version change (37 -> 41 modules)', () => {
    const v5Total = moduleSizeMm(37) * (37 + 2 * A4_SHEET.QUIET_ZONE_MODULES);
    const v6Total = moduleSizeMm(41) * (41 + 2 * A4_SHEET.QUIET_ZONE_MODULES);

    expect(v5Total).toBeCloseTo(A4_SHEET.CODE_FOOTPRINT_MM, 10);
    expect(v6Total).toBeCloseTo(A4_SHEET.CODE_FOOTPRINT_MM, 10);
  });

  it('never hardcodes a module count — module size shrinks as the symbol grows', () => {
    expect(moduleSizeMm(41)).toBeLessThan(moduleSizeMm(37));
  });
});
