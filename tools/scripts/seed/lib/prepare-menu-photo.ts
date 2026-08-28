import sharp, { type Sharp } from 'sharp';

/** A pixel this close to white is background, not product. Set low enough to
 * swallow the soft drop shadow studio shots carry under the dish. */
const BACKGROUND_MIN_CHANNEL = 200;
/** The drop shadow under a dish is darker than the paper but stays neutral grey,
 * while crust, cheese and sauce are all warm. Colour, not brightness, is what
 * separates them — a brightness threshold low enough to catch the shadow also
 * eats a pale crust. */
const SHADOW_MIN_CHANNEL = 150;
const NEUTRAL_MAX_SPREAD = 14;
/** Rim pixels between this and the background threshold fade out instead of
 * ending in a hard cut against the page. */
const FEATHER_MIN_CHANNEL = 140;
const FEATHER_RINGS = 3;
/** Wide enough for the item dialog on a retina screen, small enough that a menu
 * of twenty dishes still opens over cellular. */
const MAX_DIMENSION = 900;

const minChannel = (data: Buffer, index: number): number =>
  Math.min(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0);

const isBackground = (data: Buffer, index: number): boolean => {
  const min = minChannel(data, index);
  if (min >= BACKGROUND_MIN_CHANNEL) return true;
  const max = Math.max(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0);
  return min >= SHADOW_MIN_CHANNEL && max - min <= NEUTRAL_MAX_SPREAD;
};

const encode = (image: Sharp): Promise<Buffer> =>
  image
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82, alphaQuality: 90, effort: 5 })
    .toBuffer();

/**
 * Normalises a menu photo for the guest surfaces: bounded size, WebP, and a
 * transparent background.
 *
 * WebP rather than PNG because these are photographs — PNG's lossless coding took
 * the same image from 180 KB to 800 KB, an 8 MB menu on a phone over cellular.
 *
 * The background is flood-filled inward from the border rather than thresholded
 * per pixel, so light *inside* the dish — mozzarella, sauce, a dusting of flour —
 * keeps its opacity. A photo that is already cut out, or was never shot on white,
 * only gets the size and format pass.
 */
export const prepareMenuPhoto = async (input: Buffer): Promise<Buffer> => {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  const cornerAlphas = [
    data[3],
    data[(width - 1) * 4 + 3],
    data[(height - 1) * width * 4 + 3],
    data[(height * width - 1) * 4 + 3],
  ];
  // Already cut out by whoever produced it — running the fill would only nibble
  // at a clean edge.
  if (cornerAlphas.every((alpha) => alpha === 0)) {
    return encode(sharp(input));
  }

  const transparent = new Uint8Array(width * height);
  const stack: number[] = [];

  const push = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (transparent[pixel] === 1) return;
    if (!isBackground(data, pixel * 4)) return;
    transparent[pixel] = 1;
    stack.push(pixel);
  };

  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }

  for (let pixel = stack.pop(); pixel !== undefined; pixel = stack.pop()) {
    const x = pixel % width;
    const y = (pixel - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (transparent[pixel] === 1) data[pixel * 4 + 3] = 0;
  }

  // Ring by ring outward-in, so the studio shadow the fill could not reach fades
  // over a few pixels instead of ending in a grey halo. Only light pixels fade;
  // anything as dark as crust keeps full opacity whatever it neighbours.
  const featherRange = BACKGROUND_MIN_CHANNEL - FEATHER_MIN_CHANNEL;
  for (let ring = 0; ring < FEATHER_RINGS; ring += 1) {
    const previous = new Uint8Array(width * height);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      previous[pixel] = data[pixel * 4 + 3] ?? 0;
    }
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      if (previous[pixel] !== 255) continue;
      const x = pixel % width;
      const y = (pixel - x) / width;
      const touchesFaded =
        (x > 0 && (previous[pixel - 1] ?? 255) < 255) ||
        (x < width - 1 && (previous[pixel + 1] ?? 255) < 255) ||
        (y > 0 && (previous[pixel - width] ?? 255) < 255) ||
        (y < height - 1 && (previous[pixel + width] ?? 255) < 255);
      if (!touchesFaded) continue;

      const value = minChannel(data, pixel * 4);
      if (value <= FEATHER_MIN_CHANNEL) continue;
      data[pixel * 4 + 3] = Math.round(
        (Math.max(BACKGROUND_MIN_CHANNEL - value, 0) / featherRange) * 255,
      );
    }
  }

  return encode(sharp(data, { raw: { width, height, channels: 4 } }));
};
