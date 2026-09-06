const HEX = /^#(?:([\da-f]{3})|([\da-f]{6}))$/i;

/** The two labels a brand colour can carry. The dark one is warm, not black: on an orange or a
 * red it reads as part of the palette rather than as a hole in it. */
export const LIGHT_LABEL = '#ffffff';
export const DARK_LABEL = '#241100';

/**
 * Above this the accent is a light surface — a pale yellow, a mint, a cream — and only ink can be
 * read on it. Below it every brand colour keeps the white label restaurants expect, which is the
 * choice brands make for themselves: white on orange is the look, even where black would measure
 * higher. `contrastRatio` is exported so a colour picker can say when that choice costs legibility.
 */
const LIGHT_SURFACE_LUMINANCE = 0.45;

const channelLuminance = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const expand = (hex: string): string | null => {
  const match = HEX.exec(hex.trim());
  if (!match) return null;
  return match[1] ? [...match[1]].map((ch) => ch + ch).join('') : (match[2] ?? null);
};

/** WCAG relative luminance, or null when the colour is not a hex we can read. */
export const relativeLuminance = (hex: string): number | null => {
  const full = expand(hex);
  if (full === null) return null;
  return (
    0.2126 * channelLuminance(parseInt(full.slice(0, 2), 16)) +
    0.7152 * channelLuminance(parseInt(full.slice(2, 4), 16)) +
    0.0722 * channelLuminance(parseInt(full.slice(4, 6), 16))
  );
};

/** WCAG contrast, 1 (identical) to 21 (black on white); null if either colour is unreadable. */
export const contrastRatio = (a: string, b: string): number | null => {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  if (first === null || second === null) return null;
  const [lighter, darker] = first >= second ? [first, second] : [second, first];
  return (lighter + 0.05) / (darker + 0.05);
};

/** WCAG AA: 4.5 for body text, 3 for text at 18.66px bold or larger. */
export const meetsContrast = (background: string, foreground: string, minRatio = 4.5): boolean =>
  (contrastRatio(background, foreground) ?? 0) >= minRatio;

/**
 * The label to print on a background. Returns null for a colour we cannot read, so the caller
 * can leave its own token in place rather than guess.
 */
export const readableForeground = (background: string): string | null => {
  const luminance = relativeLuminance(background);
  if (luminance === null) return null;
  return luminance > LIGHT_SURFACE_LUMINANCE ? DARK_LABEL : LIGHT_LABEL;
};
