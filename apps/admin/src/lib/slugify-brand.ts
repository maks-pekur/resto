export const slugifyBrandName = (raw: string): string => {
  const ascii = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (ascii.length === 0) return '';
  return ascii.slice(0, 64).replace(/-+$/g, '');
};
