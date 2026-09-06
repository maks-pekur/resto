import { A4_SHEET } from './qr-sheet';

export interface DownloadTableSvgInput {
  number: string;
  qrUrl: string;
}

export const downloadTableSvg = async (input: DownloadTableSvgInput): Promise<void> => {
  const QRCode = await import('qrcode/lib/browser.js');

  const svgMarkup = await QRCode.toString(input.qrUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: A4_SHEET.QUIET_ZONE_MODULES,
  });

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `table-${input.number}.svg`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
};
