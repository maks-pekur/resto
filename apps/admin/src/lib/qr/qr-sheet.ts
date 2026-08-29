export interface SheetPlacement {
  page: number;
  column: number;
  row: number;
  footprintX: number;
  footprintY: number;
  cutBoxX: number;
  cutBoxY: number;
  gutterTextX: number;
  gutterTextBaselineY: number;
}

export const A4_SHEET = {
  PAGE_WIDTH_MM: 210,
  PAGE_HEIGHT_MM: 297,
  COLUMNS: 2,
  ROWS: 3,
  CODES_PER_PAGE: 6,
  CELL_WIDTH_MM: 105,
  CELL_HEIGHT_MM: 99,
  CODE_FOOTPRINT_MM: 84,
  CUT_BOX_MM: 90,
  QUIET_ZONE_MODULES: 4,
} as const;

const GUTTER_OFFSET_BELOW_CUT_BOX_MM = 3;

export const moduleSizeMm = (matrixSize: number): number =>
  A4_SHEET.CODE_FOOTPRINT_MM / (matrixSize + 2 * A4_SHEET.QUIET_ZONE_MODULES);

export const layoutSheet = (count: number): SheetPlacement[] => {
  const placements: SheetPlacement[] = [];

  for (let index = 0; index < count; index += 1) {
    const page = Math.floor(index / A4_SHEET.CODES_PER_PAGE);
    const indexInPage = index % A4_SHEET.CODES_PER_PAGE;
    const column = indexInPage % A4_SHEET.COLUMNS;
    const row = Math.floor(indexInPage / A4_SHEET.COLUMNS);

    const cellX = column * A4_SHEET.CELL_WIDTH_MM;
    const cellY = row * A4_SHEET.CELL_HEIGHT_MM;
    const cellCenterX = cellX + A4_SHEET.CELL_WIDTH_MM / 2;
    const cellCenterY = cellY + A4_SHEET.CELL_HEIGHT_MM / 2;

    const cutBoxX = cellCenterX - A4_SHEET.CUT_BOX_MM / 2;
    const cutBoxY = cellCenterY - A4_SHEET.CUT_BOX_MM / 2;

    placements.push({
      page,
      column,
      row,
      footprintX: cellCenterX - A4_SHEET.CODE_FOOTPRINT_MM / 2,
      footprintY: cellCenterY - A4_SHEET.CODE_FOOTPRINT_MM / 2,
      cutBoxX,
      cutBoxY,
      gutterTextX: cellCenterX,
      gutterTextBaselineY: cutBoxY + A4_SHEET.CUT_BOX_MM + GUTTER_OFFSET_BELOW_CUT_BOX_MM,
    });
  }

  return placements;
};
