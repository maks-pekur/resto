import { A4_SHEET, layoutSheet, moduleSizeMm, type SheetPlacement } from './qr-sheet';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PRINT_CONTAINER_ID = 'qr-print-sheet-container';

export interface PrintableTable {
  tableId: string;
  number: string;
  ordinal: number;
  qrUrl: string;
  status: 'active' | 'archived';
}

export interface PrintTablesSheetInput {
  zoneName: string;
  tables: PrintableTable[];
}

const compareOrdinalThenNumber = (a: PrintableTable, b: PrintableTable): number => {
  if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
  return a.number.localeCompare(b.number, undefined, { numeric: true });
};

const buildPage = (): HTMLDivElement => {
  const page = document.createElement('div');
  page.className = 'qr-print-page';
  page.style.cssText = `position:relative;width:${A4_SHEET.PAGE_WIDTH_MM}mm;height:${A4_SHEET.PAGE_HEIGHT_MM}mm;break-after:page;`;
  return page;
};

const buildCodeSvg = (
  entry: PrintableTable,
  placement: SheetPlacement,
  matrix: { size: number; get: (row: number, col: number) => number },
): SVGSVGElement => {
  const moduleSize = moduleSizeMm(matrix.size);
  const quietZoneMm = A4_SHEET.QUIET_ZONE_MODULES * moduleSize;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'qr-print-code');
  svg.setAttribute('data-table-id', entry.tableId);
  svg.setAttribute('viewBox', `0 0 ${A4_SHEET.CODE_FOOTPRINT_MM} ${A4_SHEET.CODE_FOOTPRINT_MM}`);
  svg.style.cssText = `position:absolute;left:${placement.footprintX}mm;top:${placement.footprintY}mm;width:${A4_SHEET.CODE_FOOTPRINT_MM}mm;height:${A4_SHEET.CODE_FOOTPRINT_MM}mm;`;

  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('width', String(A4_SHEET.CODE_FOOTPRINT_MM));
  background.setAttribute('height', String(A4_SHEET.CODE_FOOTPRINT_MM));
  background.setAttribute('fill', '#ffffff');
  svg.appendChild(background);

  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.get(row, col)) continue;
      const module = document.createElementNS(SVG_NS, 'rect');
      module.setAttribute('x', String(quietZoneMm + col * moduleSize));
      module.setAttribute('y', String(quietZoneMm + row * moduleSize));
      module.setAttribute('width', String(moduleSize));
      module.setAttribute('height', String(moduleSize));
      module.setAttribute('fill', '#000000');
      svg.appendChild(module);
    }
  }

  return svg;
};

const buildCutGuide = (placement: SheetPlacement): HTMLDivElement => {
  const guide = document.createElement('div');
  guide.className = 'qr-print-cut-guide';
  guide.style.cssText = `position:absolute;left:${placement.cutBoxX}mm;top:${placement.cutBoxY}mm;width:${A4_SHEET.CUT_BOX_MM}mm;height:${A4_SHEET.CUT_BOX_MM}mm;border:0.2mm solid #000000;`;
  return guide;
};

const buildGutterLabel = (entry: PrintableTable, placement: SheetPlacement): HTMLDivElement => {
  const label = document.createElement('div');
  label.className = 'qr-print-gutter';
  label.textContent = entry.number;
  label.style.cssText = `position:absolute;left:${placement.gutterTextX}mm;top:${placement.gutterTextBaselineY}mm;transform:translateX(-50%);font-size:3mm;text-align:center;`;
  return label;
};

const buildPrintStyle = (): HTMLStyleElement => {
  const style = document.createElement('style');
  style.textContent = `
@page { size: A4 portrait; margin: 0; }
#${PRINT_CONTAINER_ID} { display: none; }
@media print {
  body > *:not(#${PRINT_CONTAINER_ID}) { display: none !important; }
  #${PRINT_CONTAINER_ID} { display: block !important; }
}
`;
  return style;
};

export const printTablesSheet = async (input: PrintTablesSheetInput): Promise<void> => {
  const activeTables = input.tables
    .filter((table) => table.status === 'active')
    .slice()
    .sort(compareOrdinalThenNumber);

  if (activeTables.length === 0) return;

  const QRCode = await import('qrcode/lib/browser.js');

  const placements = layoutSheet(activeTables.length);
  const pageCount = Math.ceil(activeTables.length / A4_SHEET.CODES_PER_PAGE);
  const pages = Array.from({ length: pageCount }, buildPage);

  activeTables.forEach((entry, index) => {
    const placement = placements[index];
    if (!placement) return;
    const page = pages[placement.page];
    if (!page) return;

    const symbol = QRCode.create(entry.qrUrl, { errorCorrectionLevel: 'M' });
    page.append(
      buildCutGuide(placement),
      buildCodeSvg(entry, placement, symbol.modules),
      buildGutterLabel(entry, placement),
    );
  });

  const style = buildPrintStyle();
  const container = document.createElement('div');
  container.id = PRINT_CONTAINER_ID;
  container.append(...pages);

  const previousTitle = document.title;
  document.title = input.zoneName;

  document.head.appendChild(style);
  document.body.appendChild(container);

  const cleanup = (): void => {
    container.remove();
    style.remove();
    document.title = previousTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  window.print();
};
